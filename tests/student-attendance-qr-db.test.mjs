import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const migrationsDir = new URL('../supabase/migrations/', import.meta.url)
const users = {
  jess: '00000000-0000-4000-8000-0000000000a1',
  kai: '00000000-0000-4000-8000-0000000000a2',
  mia: '00000000-0000-4000-8000-0000000000a3',
  ken: '00000000-0000-4000-8000-0000000000b1',
  amy: '00000000-0000-4000-8000-0000000000b2',
}
const students = { jess: '00000000-0000-4000-8000-0000000000c1', kai: '00000000-0000-4000-8000-0000000000c2', mia: '00000000-0000-4000-8000-0000000000c3' }
const instructors = { ken: '00000000-0000-4000-8000-0000000000d1', amy: '00000000-0000-4000-8000-0000000000d2' }
const events = {
  open: '00000000-0000-4000-8000-0000000000e1', // started 5 minutes ago, Ken teaches
  other: '00000000-0000-4000-8000-0000000000e2', // also open now, Ken teaches
  soon: '00000000-0000-4000-8000-0000000000e3', // starts in 20 minutes
  amys: '00000000-0000-4000-8000-0000000000e4', // open now, Amy teaches
}

test('rotating attendance QR codes (offline PostgreSQL)', async (suite) => {
  const db = new PGlite({ extensions: { pgcrypto } })

  async function as(role, userId, sql, params = []) {
    await db.exec(`begin; set local role ${role};`)
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ''])
      const { rows: [row] } = await db.query(sql, params)
      return row
    } finally {
      await db.exec('rollback')
    }
  }
  // Writes must persist, so scans run in their own committed transaction.
  async function scan(instructor, payload, event) {
    await db.exec('begin; set local role authenticated;')
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [users[instructor]])
      const { rows: [row] } = await db.query('select public.check_in_with_qr($1, $2) as r', [payload, event])
      await db.exec('commit')
      return row.r
    } catch (error) {
      await db.exec('rollback')
      throw error
    }
  }
  const qr = async (student) => (await as('authenticated', users[student], 'select public.student_attendance_qr() as r')).r
  const signed = async (event, student, minutesAgo) => {
    const { rows: [row] } = await db.query(`
      select format('ASK:ATT:v1:%s:%s:%s:%s', $1::uuid, $2::uuid, m, attendance_private.qr_signature($1, $2, m)) as payload
      from (select floor(extract(epoch from now()) / 60)::bigint - $3 as m) t`, [event, student, minutesAgo])
    return row.payload
  }

  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create schema extensions;
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
    `)
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql') && f <= '20261102041227_reset_and_domain_schema.sql')
      .sort()
    for (const file of files) await db.exec(await readFile(new URL(file, migrationsDir), 'utf8'))
    await db.exec(await readFile(new URL('20261111141847_student_attendance_qr.sql', migrationsDir), 'utf8'))

    for (const [key, id] of Object.entries(users)) {
      await db.query('insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)',
        [id, `${key}@example.test`, key in instructors ? '{"role":"instructor"}' : '{}'])
    }
    await db.exec(`
      insert into public.grades (id, label, sort_order, is_ranked) values ('unranked', 'Unranked', 0, false);
      insert into public.class_types (id, label, description) values ('adult', 'Adult', 'All levels');
      insert into public.centres (id, name, short_name) values ('00000000-0000-4000-8000-0000000000f1', 'Bishan Dojo', 'BSH');
      insert into public.instructors (id, user_id, first_name, last_name, email) values
        ('${instructors.ken}', '${users.ken}', 'Ken', 'Tan', 'ken@example.test'),
        ('${instructors.amy}', '${users.amy}', 'Amy', 'Lee', 'amy@example.test');
      insert into public.students (id, user_id, member_no, first_name, last_name, email, home_centre_id,
          date_of_birth, joined_at, current_grade_id, membership_status) values
        ('${students.jess}', '${users.jess}', 'M1', 'Jess', 'Tan', 'jess@example.test', '00000000-0000-4000-8000-0000000000f1', '1995-01-01', '2025-01-01', 'unranked', 'active'),
        ('${students.kai}', '${users.kai}', 'M2', 'Kai', 'Lim', 'kai@example.test', '00000000-0000-4000-8000-0000000000f1', '1995-01-01', '2025-01-01', 'unranked', 'active'),
        ('${students.mia}', '${users.mia}', 'M3', 'Mia', 'Ng', 'mia@example.test', '00000000-0000-4000-8000-0000000000f1', '1995-01-01', '2025-01-01', 'unranked', 'active');
    `)
    for (const [key, id] of Object.entries(events)) {
      const start = key === 'soon' ? "now() + interval '20 minutes'" : "now() - interval '5 minutes'"
      const teacher = key === 'amys' ? instructors.amy : instructors.ken
      await db.exec(`
        insert into public.events (id, event_type, centre_id, instructor_id, name, starts_at, ends_at, status)
          values ('${id}', 'class', '00000000-0000-4000-8000-0000000000f1', '${teacher}', 'Class ${key}',
            ${start}, ${start} + interval '1 hour', 'scheduled');
        insert into public.classes (event_id, class_type_id) values ('${id}', 'adult');
      `)
    }
    // Jess and Kai are booked into the open class; Mia only into the one starting soon.
    await db.exec(`
      insert into public.event_students (event_id, student_id) values
        ('${events.open}', '${students.jess}'), ('${events.open}', '${students.kai}'),
        ('${events.soon}', '${students.mia}');
    `)

    await suite.test('a booked student gets a signed code for the open class, refreshing at the next minute', async () => {
      const r = await qr('jess')
      assert.equal(r.status, 'ready')
      assert.equal(r.event_id, events.open)
      assert.match(r.payload, new RegExp(`^ASK:ATT:v1:${events.open}:${students.jess}:\\d+:[0-9a-f]{32}$`))
      const wait = Date.parse(r.refresh_at) - Date.parse(r.server_now)
      assert.ok(wait > 0 && wait <= 60_000, `refreshes within a minute (got ${wait}ms)`)
    })

    await suite.test('codes are unique per student and class', async () => {
      const [jess, kai] = [await qr('jess'), await qr('kai')]
      assert.notEqual(jess.payload.split(':').at(-1), kai.payload.split(':').at(-1))
    })

    await suite.test('a class later today reports when check-in opens; no class reports none', async () => {
      const mia = await qr('mia')
      assert.equal(mia.status, 'upcoming')
      assert.equal(mia.payload, undefined)
      await db.exec(`delete from public.event_students where student_id = '${students.mia}'`)
      assert.deepEqual(await qr('mia'), { status: 'none' })
    })

    await suite.test('the teaching instructor checks a student in once; the code then shows checked in', async () => {
      const { payload } = await qr('jess')
      const first = await scan('ken', payload, events.open)
      assert.equal(first.status, 'marked')
      assert.equal(first.already_marked, false)
      assert.equal(first.student_name, 'Jess Tan')
      const { rows: [row] } = await db.query(
        'select attendance_status, checked_in_at from public.event_students where event_id = $1 and student_id = $2',
        [events.open, students.jess])
      assert.equal(row.attendance_status, 'present')
      assert.ok(row.checked_in_at)
      assert.equal((await scan('ken', payload, events.open)).already_marked, true)
      assert.equal((await qr('jess')).status, 'checked_in')
    })

    await suite.test('tampered, expired and forged codes are rejected', async () => {
      const { payload } = await qr('kai')
      const tampered = payload.replace(/.$/, (c) => (c === '0' ? '1' : '0'))
      assert.equal((await scan('ken', tampered, events.open)).status, 'invalid')
      assert.equal((await scan('ken', 'ASK:CHECKIN:student-1', events.open)).status, 'invalid')
      assert.equal((await scan('ken', await signed(events.open, students.kai, 5), events.open)).status, 'expired')
      // Last minute's code is still accepted, for a scan that straddles the refresh.
      assert.equal((await scan('ken', await signed(events.open, students.kai, 1), events.open)).status, 'marked')
    })

    await suite.test('codes only work in their own class, for booked students and the teaching instructor', async () => {
      const mine = await signed(events.open, students.mia, 0)
      assert.equal((await scan('ken', mine, events.other)).status, 'wrong_class')
      assert.equal((await scan('ken', mine, events.open)).status, 'not_booked')
      assert.equal((await scan('amy', mine, events.open)).status, 'forbidden')
      assert.equal((await scan('amy', mine, events.amys)).status, 'wrong_class')
    })

    await suite.test('check-in is not open more than 10 minutes before class', async () => {
      await db.exec(`insert into public.event_students (event_id, student_id) values ('${events.soon}', '${students.mia}')`)
      assert.equal((await scan('ken', await signed(events.soon, students.mia, 0), events.soon)).status, 'upcoming')
    })

    await suite.test('students cannot check in, and nobody can read the signing key', async () => {
      const { payload } = await qr('kai')
      const r = await as('authenticated', users.jess, 'select public.check_in_with_qr($1, $2) as r', [payload, events.open])
      assert.equal(r.r.status, 'forbidden')
      await assert.rejects(as('authenticated', users.jess, 'select secret from attendance_private.qr_key'), /permission denied/)
      await assert.rejects(as('anon', null, 'select public.student_attendance_qr()'), /permission denied/)
      await assert.rejects(
        as('authenticated', users.ken, "select attendance_private.qr_signature($1, $2, 1)", [events.open, students.kai]),
        /permission denied/)
    })
  } finally {
    await db.close()
  }
})
