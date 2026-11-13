import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('instructor profile fields and private addresses (offline PostgreSQL)', async suite => {
  const db = new PGlite()
  const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const ids = { admin: uuid(1), instructor: uuid(2), other: uuid(3), student: uuid(4) }

  async function asAccount(user, operation, role = 'authenticated') {
    await db.exec(`begin; set local role ${role}`)
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? ''])
      return await operation()
    } finally {
      await db.exec('rollback')
    }
  }

  async function migrate(filename) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8'))
  }

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
      create schema storage;
      create table storage.buckets (
        id text primary key, name text not null, public boolean not null default false,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text references storage.buckets(id), name text not null,
        unique(bucket_id, name)
      );
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon, authenticated, service_role;
      grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
    `)
    for (const filename of [
      '20261026120000_auth_roles.sql', '20261026130000_sync_trusted_roles.sql',
      '20261030120000_copilot_records.sql', '20261030130000_gpt_names.sql',
      '20261102041227_reset_and_domain_schema.sql',
      '20261103185301_grading_checkout.sql', '20261104120000_instructor_reads.sql',
      '20261104130000_instructor_availability.sql',
    ]) await migrate(filename)

    for (const [name, role] of [
      ['admin', 'administrator'], ['instructor', 'instructor'],
      ['other', 'instructor'], ['student', 'student'],
    ]) {
      await db.query('insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,$3)',
        [ids[name], `${name}@example.test`, JSON.stringify({ role })])
    }
    const { rows: existing } = await db.query('select id,user_id,created_at from public.instructors order by user_id')
    const instructor = existing.find(row => row.user_id === ids.instructor).id
    const other = existing.find(row => row.user_id === ids.other).id

    await migrate('20261108062206_instructor_profile_fields.sql')
    await migrate('20261108064635_instructor_profile_editing.sql')
    await migrate('20261108161141_instructor_grades.sql')
    await migrate('20261111100917_instructor_titles.sql')
    const legacyTitles = await db.query('select instructor_title from public.instructors where user_id = any($1::uuid[])', [[ids.instructor, ids.other]])
    assert.ok(legacyTitles.rows.every(row => row.instructor_title === null))
    await migrate('20261111120948_required_instructor_title.sql')
    await migrate('20261111123748_grading_panels.sql')

    await suite.test('examiner flag defaults to false and comes from trusted account metadata', async () => {
      const existing = await db.query('select is_examiner from public.instructors where user_id = any($1::uuid[])', [[ids.instructor, ids.other]])
      assert.ok(existing.rows.every(row => row.is_examiner === false))
      const [examiner, plain] = [uuid(30), uuid(31)]
      await db.query('insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,$3),($4,$5,$6)', [
        examiner, 'examiner@example.test', JSON.stringify({ role: 'instructor', instructor_is_examiner: true }),
        plain, 'plain@example.test', JSON.stringify({ role: 'instructor' })])
      const { rows } = await db.query('select user_id, is_examiner from public.instructors where user_id = any($1::uuid[]) order by user_id', [[examiner, plain]])
      assert.deepEqual(rows, [{ user_id: examiner, is_examiner: true }, { user_id: plain, is_examiner: false }])
      for (const user of [ids.instructor, ids.other]) {
        const updated = await asAccount(user, () => db.query('update public.instructors set is_examiner=true where user_id=$1 returning id', [user]))
        assert.equal(updated.rows.length, 0)
      }
      await db.query('delete from public.instructors where user_id = any($1::uuid[])', [[examiner, plain]])
      await db.query('delete from auth.users where id = any($1::uuid[])', [[examiner, plain]])
    })

    await suite.test('existing null titles are backfilled to none and the column is required', async () => {
      const { rows } = await db.query('select instructor_title from public.instructors where user_id = any($1::uuid[])', [[ids.instructor, ids.other]])
      assert.deepEqual(rows.map(row => row.instructor_title), ['none', 'none'])
      const column = await db.query(`select is_nullable, column_default from information_schema.columns
        where table_schema='public' and table_name='instructors' and column_name='instructor_title'`)
      assert.equal(column.rows[0].is_nullable, 'NO')
      assert.match(column.rows[0].column_default, /'none'/)
      await assert.rejects(() => db.query('update public.instructors set instructor_title=null where id=$1', [instructor]),
        error => error.code === '23502')
      // Grade stays nullable until the flagged ungraded instructors are assigned one.
      const grade = await db.query(`select is_nullable from information_schema.columns
        where table_schema='public' and table_name='instructors' and column_name='grade_id'`)
      assert.equal(grade.rows[0].is_nullable, 'YES')
    })

    await suite.test('instructor title CHECK matches the shared list and rejects other roles', async () => {
      const source = await readFile(new URL('../supabase/functions/_shared/instructor-titles.ts', import.meta.url), 'utf8')
      const shared = [...source.match(/INSTRUCTOR_TITLES = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(match => match[1])
      assert.deepEqual(shared, ['none', 'fukushidoin', 'shidoin', 'shihan'])
      const { rows } = await db.query(`select pg_get_constraintdef(oid) as definition from pg_constraint
        where conrelid='public.instructors'::regclass and conname='instructors_instructor_title_check'`)
      assert.deepEqual([...rows[0].definition.matchAll(/'([^']+)'/g)].map(match => match[1]).sort(), shared.toSorted())
      for (const value of shared) {
        await db.query('update public.instructors set instructor_title=$1 where id=$2', [value, instructor])
      }
      for (const value of ['dojo-cho', 'chief_instructor', '', 'Shihan', 'None']) {
        await assert.rejects(() => db.query('update public.instructors set instructor_title=$1 where id=$2',
          [value, instructor]), error => error.code === '23514')
      }
      await db.query("update public.instructors set instructor_title='none' where id=$1", [instructor])
    })

    await suite.test('only administrators can set instructor titles; instructors cannot self-edit', async () => {
      for (const user of [ids.instructor, ids.other, ids.student]) {
        const { rows } = await asAccount(user, () => db.query(
          "update public.instructors set instructor_title='shihan' where id=$1 returning id", [instructor]))
        assert.equal(rows.length, 0)
      }
      const unchanged = await db.query('select instructor_title from public.instructors where id=$1', [instructor])
      assert.equal(unchanged.rows[0].instructor_title, 'none')
      const { rows } = await asAccount(ids.admin, () => db.query(
        "update public.instructors set instructor_title='shidoin' where id=$1 returning instructor_title", [instructor]))
      assert.deepEqual(rows, [{ instructor_title: 'shidoin' }])
    })

    await suite.test('instructor titles come from trusted metadata and default to none', async () => {
      const titled = uuid(22)
      const untitled = uuid(24)
      await db.query('insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,$3),($4,$5,$6)', [
        titled, 'titled@example.test', JSON.stringify({ role: 'instructor', instructor_title: 'fukushidoin' }),
        untitled, 'untitled@example.test', JSON.stringify({ role: 'instructor' })])
      const { rows } = await db.query('select user_id, instructor_title from public.instructors where user_id = any($1::uuid[]) order by user_id', [[titled, untitled]])
      assert.deepEqual(rows, [{ user_id: titled, instructor_title: 'fukushidoin' }, { user_id: untitled, instructor_title: 'none' }])
      await assert.rejects(() => db.query('insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,$3)',
        [uuid(23), 'bad-title@example.test', JSON.stringify({ role: 'instructor', instructor_title: 'dojo-cho' })]),
      error => error.code === '23514')
      assert.equal((await db.query('select id from auth.users where id=$1', [uuid(23)])).rows.length, 0)
      await db.query('delete from public.instructors where user_id = any($1::uuid[])', [[titled, untitled]])
      await db.query('delete from auth.users where id = any($1::uuid[])', [[titled, untitled]])
    })

    await suite.test('existing instructors are preserved with unspecified new fields', async () => {
      const { rows } = await db.query('select id,user_id,created_at from public.instructors order by user_id')
      assert.deepEqual(rows, existing)
      const fields = await db.query('select profile_picture_url,employment_type from public.instructors')
      assert.ok(fields.rows.every(row => row.profile_picture_url === null && row.employment_type === null))
    })

    await suite.test('timestamp and trigger are removed without breaking instructor updates', async () => {
      const { rows } = await db.query(`select column_name from information_schema.columns
        where table_schema='public' and table_name='instructors' and column_name='updated_at'`)
      assert.equal(rows.length, 0)
      const triggers = await db.query(`select tgname from pg_trigger
        where tgrelid='public.instructors'::regclass and tgname='instructors_set_updated_at'`)
      assert.equal(triggers.rows.length, 0)
      await asAccount(ids.admin, () => db.query(`update public.instructors
        set profile_picture_url='https://example.test/photo.jpg', employment_type='full_time'
        where id=$1 returning id`, [instructor]))
      // Other tables still need the shared timestamp function.
      await db.query("update public.users set phone='12345678' where id=$1", [ids.instructor])
    })

    await suite.test('employment type accepts only the supported values or null', async () => {
      for (const value of ['part_time', 'full_time', null]) {
        await db.query('update public.instructors set employment_type=$1 where id=$2', [value, instructor])
      }
      for (const value of ['contract', '', 'FULL_TIME']) {
        await assert.rejects(() => db.query('update public.instructors set employment_type=$1 where id=$2',
          [value, instructor]), error => error.code === '23514')
      }
    })

    await db.query('insert into public.instructor_private_details(instructor_id,address) values ($1,$2),($3,$4)',
      [instructor, 'First private address', other, 'Second private address'])

    await suite.test('administrators read all addresses; instructors read only their own; students read none', async () => {
      for (const [user, expected] of [
        [ids.admin, [instructor, other]], [ids.instructor, [instructor]],
        [ids.other, [other]], [ids.student, []],
      ]) {
        const { rows } = await asAccount(user, () => db.query('select instructor_id from public.instructor_private_details'))
        assert.deepEqual(rows.map(row => row.instructor_id).sort(), expected.toSorted())
      }
    })

    await suite.test('only administrators can manage private details through authenticated access', async () => {
      for (const user of [ids.instructor, ids.other, ids.student]) {
        for (const statement of [
          "update public.instructor_private_details set address='Changed' returning instructor_id",
          'delete from public.instructor_private_details returning instructor_id',
        ]) {
          const { rows } = await asAccount(user, () => db.query(statement))
          assert.equal(rows.length, 0)
        }
        await assert.rejects(() => asAccount(user, () => db.query(
          'insert into public.instructor_private_details(instructor_id,address) values ($1,$2)',
          [instructor, 'Not allowed'])), error => error.code === '42501')
        await assert.rejects(() => asAccount(user, () => db.exec('truncate public.instructor_private_details')),
          error => error.code === '42501')
      }
      await asAccount(ids.admin, async () => {
        const updated = await db.query("update public.instructor_private_details set address='Updated' where instructor_id=$1 returning address", [instructor])
        assert.equal(updated.rows[0].address, 'Updated')
        await db.query('delete from public.instructor_private_details where instructor_id=$1', [instructor])
        await db.query('insert into public.instructor_private_details(instructor_id,address) values ($1,null)', [instructor])
      })
    })

    await suite.test('anonymous access is denied and trusted service access is available', async () => {
      await assert.rejects(() => asAccount(null, () => db.query('select * from public.instructor_private_details'), 'anon'),
        error => error.code === '42501')
      const { rows } = await asAccount(null, () => db.query('select * from public.instructor_private_details'), 'service_role')
      assert.equal(rows.length, 2)
    })

    await suite.test('directory remains readable without exposing addresses', async () => {
      const { rows } = await asAccount(ids.student, () => db.query('select * from public.instructors'))
      assert.equal(rows.length, 2)
      assert.ok(rows.every(row => !('address' in row) && !('updated_at' in row)))
    })

    const ownPhoto = `${ids.instructor}/${uuid(100)}.jpg`
    const otherPhoto = `${ids.other}/${uuid(101)}.jpg`
    const savePhoto = (expectedUser, expectedPath, path) => db.query(
      'select public.save_instructor_profile_photo($1,$2,$3) as saved', [expectedUser, expectedPath, path])
    const saveAddress = (expectedUser, value) => db.query(
      'select public.save_instructor_address($1,$2) as saved', [expectedUser, value])

    await suite.test('instructors save, read back, clear and create their own address through the narrow RPC', async () => {
      for (const value of ['  New street\nSingapore 123456  ', '', 'x'.repeat(1000)]) {
        await asAccount(ids.instructor, async () => {
          const { rows } = await saveAddress(ids.instructor, value)
          assert.equal(rows[0].saved.address, value.trim() || null)
          const saved = await db.query('select address from public.instructor_private_details where instructor_id=$1', [instructor])
          assert.equal(saved.rows[0].address, value.trim() || null)
        })
      }
      await db.query('delete from public.instructor_private_details where instructor_id=$1', [instructor])
      await asAccount(ids.instructor, async () => {
        await saveAddress(ids.instructor, 'First saved address')
        const { rows } = await db.query('select address from public.instructor_private_details')
        assert.deepEqual(rows, [{ address: 'First saved address' }])
      })
      await assert.rejects(() => asAccount(ids.instructor, () => saveAddress(ids.instructor, 'x'.repeat(1001))),
        error => error.code === '22023')
    })

    await suite.test('profile saves reject anonymous, mismatched, non-instructor and demoted accounts', async () => {
      for (const operation of [
        user => saveAddress(user, 'Unauthorized'), user => savePhoto(user, null, null),
      ]) {
        for (const [actor, expected, role] of [
          [null, ids.instructor, 'anon'], [ids.instructor, ids.other, 'authenticated'],
          [ids.student, ids.student, 'authenticated'], [ids.admin, ids.admin, 'authenticated'],
        ]) await assert.rejects(() => asAccount(actor, () => operation(expected), role), error => error.code === '42501')
      }
      await db.query(`update auth.users set raw_app_meta_data='{}' where id=$1`, [ids.instructor])
      await assert.rejects(() => asAccount(ids.instructor, () => saveAddress(ids.instructor, 'Unauthorized')), error => error.code === '42501')
      await assert.rejects(() => asAccount(ids.instructor, () => db.query(
        "insert into storage.objects(bucket_id,name) values ('instructor-photos',$1)", [ownPhoto])), error => error.code === '42501')
      await db.query(`update auth.users set raw_app_meta_data='{"role":"instructor"}' where id=$1`, [ids.instructor])
    })

    await suite.test('photo bucket is private, size-limited and restricted to supported image MIME types', async () => {
      const { rows } = await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='instructor-photos'")
      assert.equal(rows[0].public, false)
      assert.equal(Number(rows[0].file_size_limit), 5 * 1024 * 1024)
      assert.deepEqual(rows[0].allowed_mime_types, ['image/jpeg', 'image/png', 'image/webp'])
    })

    await db.query("insert into storage.objects(bucket_id,name) values ('instructor-photos',$1)", [otherPhoto])
    await suite.test('instructors upload/delete only their own photos; anonymous reads and overwrites are denied', async () => {
      await asAccount(ids.instructor, async () => {
        await db.query("insert into storage.objects(bucket_id,name) values ('instructor-photos',$1)", [ownPhoto])
        const { rows } = await db.query('delete from storage.objects where name=$1 returning name', [ownPhoto])
        assert.equal(rows.length, 1)
        const others = await db.query('delete from storage.objects where name=$1 returning name', [otherPhoto])
        assert.equal(others.rows.length, 0)
        const overwritten = await db.query("update storage.objects set name='changed' returning name")
        assert.equal(overwritten.rows.length, 0)
      })
      for (const [actor, path] of [[ids.instructor, otherPhoto], [ids.student, `${ids.student}/${uuid(102)}.jpg`],
        [ids.instructor, `${ids.instructor}/bad.svg`]]) {
        await assert.rejects(() => asAccount(actor, () => db.query(
          "insert into storage.objects(bucket_id,name) values ('instructor-photos',$1)", [path])), error => error.code === '42501')
      }
      const { rows } = await asAccount(null, () => db.query('select * from storage.objects'), 'anon')
      assert.equal(rows.length, 0)
    })

    await suite.test('photo RPC requires a real owned upload, fences stale changes and does not expand direct instructor updates', async () => {
      await asAccount(ids.instructor, async () => {
        await db.query("insert into storage.objects(bucket_id,name) values ('instructor-photos',$1)", [ownPhoto])
        const saved = await savePhoto(ids.instructor, null, ownPhoto)
        assert.equal(saved.rows[0].saved.photo_path, ownPhoto)
        const row = await db.query('select profile_picture_url from public.instructors where id=$1', [instructor])
        assert.equal(row.rows[0].profile_picture_url, ownPhoto)
        const removed = await savePhoto(ids.instructor, ownPhoto, null)
        assert.equal(removed.rows[0].saved.photo_path, null)
        const protectedRows = await db.query("update public.instructors set employment_type='full_time', user_id=$1 returning id", [ids.other])
        assert.equal(protectedRows.rows.length, 0)
      })
      for (const path of [ownPhoto, otherPhoto, 'https://example.test/fake.jpg']) {
        await assert.rejects(() => asAccount(ids.instructor, () => savePhoto(ids.instructor, null, path)), error => error.code === '22023')
      }
      await assert.rejects(() => asAccount(ids.instructor, () => savePhoto(ids.instructor, 'stale', null)), error => error.code === 'PPR01')
    })

    await suite.test('new account provisioning works and private details cascade on instructor deletion', async () => {
      await db.query(`insert into auth.users(id,email,raw_app_meta_data)
        values ($1,'new@example.test','{"role":"instructor"}')`, [uuid(5)])
      const { rows } = await db.query('select employment_type,profile_picture_url from public.instructors where user_id=$1', [uuid(5)])
      assert.deepEqual(rows, [{ employment_type: null, profile_picture_url: null }])
      await db.query('delete from public.instructors where id=$1', [instructor])
      const remaining = await db.query('select * from public.instructor_private_details where instructor_id=$1', [instructor])
      assert.equal(remaining.rows.length, 0)
    })
  } finally {
    await db.close()
  }
})
