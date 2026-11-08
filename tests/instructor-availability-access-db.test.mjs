import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('only part-time instructors can read or write availability (offline PostgreSQL)', async suite => {
  const db = new PGlite()
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const users = { admin: uuid(1), part: uuid(2), peer: uuid(3), full: uuid(4), unset: uuid(5), student: uuid(6), unlinked: uuid(7) }
  let instructors, date
  async function asAccount(user, operation, { role = 'authenticated', commit = false } = {}) {
    await db.exec(`begin; set local role ${role}`)
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? ''])
      const result = await operation()
      if (commit) await db.exec('commit')
      return result
    } finally { await db.exec('rollback') }
  }
  const create = (user, start = '16:00', end = '17:00') => db.query(
    'select public.create_instructor_availability($1,$2,$3,$4) as saved', [user, date, start, end])
  const save = (request, user, slot, kind, expected, value = null) => db.query(
    'select public.save_instructor_availability($1,$2,$3,$4,$5,$6) as saved',
    [request, user, slot, kind, JSON.stringify(expected), value === null ? null : JSON.stringify(value)])

  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text,
        raw_user_meta_data jsonb not null default '{}',
        raw_app_meta_data jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    `)
    for (const file of [
      '20261026120000_auth_roles.sql', '20261026130000_sync_trusted_roles.sql',
      '20261030120000_copilot_records.sql', '20261030130000_gpt_names.sql',
      '20261102041227_reset_and_domain_schema.sql', '20261103185301_grading_checkout.sql',
      '20261104120000_instructor_reads.sql', '20261104130000_instructor_availability.sql',
      '20261108062206_instructor_profile_fields.sql',
    ]) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))

    for (const [name, id] of Object.entries(users)) {
      const role = name === 'admin' ? 'administrator' : name === 'student' ? 'student' : 'instructor'
      await db.query('insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,$3)',
        [id, `${name}@example.test`, JSON.stringify({ role })])
    }
    const { rows } = await db.query('select id,user_id from public.instructors')
    instructors = Object.fromEntries(Object.entries(users).map(([name, id]) => [name, rows.find(row => row.user_id === id)?.id]))
    await db.query("update public.instructors set employment_type='part_time' where id=any($1::uuid[])", [[instructors.part, instructors.peer]])
    await db.query("update public.instructors set employment_type='full_time' where id=$1", [instructors.full])
    await db.query('delete from public.instructors where id=$1', [instructors.unlinked])
    date = (await db.query("select ((now() at time zone 'Asia/Singapore')::date + 30)::text as date")).rows[0].date
    for (const name of ['part', 'peer', 'full', 'unset']) {
      await db.query('insert into public.instructor_availability(id,instructor_id,date,start_time,end_time) values ($1,$2,$3,$4,$5)',
        [uuid(100 + Object.keys(users).indexOf(name)), instructors[name], date, '09:00', '10:00'])
    }
    await db.exec(await readFile(new URL('../supabase/migrations/20261108074638_part_time_instructor_availability.sql', import.meta.url), 'utf8'))

    await suite.test('part-time instructors see only their own slots; other employment types and students see none', async () => {
      for (const name of ['part', 'peer', 'full', 'unset', 'student', 'unlinked', 'admin']) {
        const result = await asAccount(users[name], () => db.query('select instructor_id from public.instructor_availability'))
        const expected = name === 'admin' ? 4 : ['part', 'peer'].includes(name) ? 1 : 0
        assert.equal(result.rows.length, expected, name)
        if (name === 'part' || name === 'peer') assert.equal(result.rows[0].instructor_id, instructors[name])
      }
    })

    await suite.test('eligibility helper is fail-closed for full-time, unset, unlinked and non-instructor accounts', async () => {
      for (const [name, id] of Object.entries(users)) {
        const result = await asAccount(id, () => db.query('select public.current_part_time_instructor_id() as id'))
        assert.equal(result.rows[0].id, ['part', 'peer'].includes(name) ? instructors[name] : null, name)
      }
      await assert.rejects(() => asAccount(null, () => db.query('select public.current_part_time_instructor_id()'), { role: 'anon' }),
        error => error.code === '42501')
    })

    await suite.test('part-time creation, exact retries and overlap validation continue to work', async () => {
      await asAccount(users.part, async () => {
        const first = await create(users.part)
        const retry = await create(users.part)
        assert.equal(first.rows[0].saved.id, retry.rows[0].saved.id)
        assert.equal(first.rows[0].saved.instructor_id, instructors.part)
      })
      await assert.rejects(() => asAccount(users.part, () => create(users.part, '09:30', '10:30')), error => error.code === 'PAV01')
      await assert.rejects(() => asAccount(users.part, () => create(users.part, '07:00', '08:00')), error => error.code === 'PAV03')
    })

    await suite.test('full-time, unset and unlinked instructors cannot create or retrieve an old exact-slot retry', async () => {
      for (const name of ['full', 'unset', 'unlinked']) {
        await assert.rejects(() => asAccount(users[name], () => create(users[name])), error => error.code === 'PAV06', name)
        await assert.rejects(() => asAccount(users[name], () => create(users[name], '09:00', '10:00')), error => error.code === 'PAV06', name)
      }
      for (const name of ['student', 'admin']) {
        await assert.rejects(() => asAccount(users[name], () => create(users[name])), error => error.code === '42501', name)
      }
      await assert.rejects(() => asAccount(users.part, () => create(users.full)), error => error.code === '42501')
    })

    await suite.test('REST inserts cannot bypass employment or ownership checks; existing rows are not removed', async () => {
      for (const [actor, owner] of [['full', 'full'], ['unset', 'unset'], ['part', 'peer'], ['student', 'part']]) {
        await assert.rejects(() => asAccount(users[actor], () => db.query(`insert into public.instructor_availability(instructor_id,date,start_time,end_time)
          values ($1,$2,'16:00','17:00')`, [instructors[owner], date])), error => ['42501', 'PAV06'].includes(error.code))
      }
      assert.equal(Number((await db.query('select count(*) as total from public.instructor_availability')).rows[0].total), 4)
      await assert.rejects(() => asAccount(users.full, () => db.exec('truncate public.instructor_availability')), error => error.code === '42501')
      await assert.rejects(() => asAccount(null, () => db.query('select * from public.instructor_availability'), { role: 'anon' }), error => error.code === '42501')
    })

    await suite.test('the trigger also blocks full-time writes inside a security-definer function', async () => {
      await db.exec(`create function public.test_privileged_availability_insert(target uuid, day date)
        returns void language plpgsql security definer set search_path='' as $$ begin
          insert into public.instructor_availability(instructor_id,date,start_time,end_time) values(target,day,'18:00','19:00');
        end; $$; grant execute on function public.test_privileged_availability_insert(uuid,date) to authenticated;`)
      await assert.rejects(() => asAccount(users.full, () => db.query(
        'select public.test_privileged_availability_insert($1,$2)', [instructors.full, date])), error => error.code === 'PAV06')
    })

    await suite.test('receipt retries cannot return availability after employment access is revoked', async () => {
      const slot = (await db.query('select id from public.instructor_availability where instructor_id=$1', [instructors.part])).rows[0].id
      const request = uuid(200)
      const expected = { date, startTime: '09:00', endTime: '10:00' }
      const first = await asAccount(users.part, () => save(request, users.part, slot, 'delete', expected), { commit: true })
      const retry = await asAccount(users.part, () => save(request, users.part, slot, 'delete', expected))
      assert.deepEqual(retry.rows, first.rows)
      await db.query("update public.instructors set employment_type='full_time' where id=$1", [instructors.part])
      await assert.rejects(() => asAccount(users.part, () => save(request, users.part, slot, 'delete', expected)), error => error.code === 'PAV06')
      await assert.rejects(() => asAccount(users.part, () => create(users.part)), error => error.code === 'PAV06')
      await db.query("update public.instructors set employment_type='part_time' where id=$1", [instructors.part])
    })

    await suite.test('administrative management remains available and a role demotion revokes access', async () => {
      await asAccount(users.admin, () => db.query(`insert into public.instructor_availability(instructor_id,date,start_time,end_time)
        values ($1,$2,'18:00','19:00')`, [instructors.full, date]))
      await db.query(`update auth.users set raw_app_meta_data='{}' where id=$1`, [users.peer])
      const denied = await asAccount(users.peer, () => db.query('select * from public.instructor_availability'))
      assert.equal(denied.rows.length, 0)
      await assert.rejects(() => asAccount(users.peer, () => create(users.peer)), error => error.code === '42501')
    })
  } finally { await db.close() }
})
