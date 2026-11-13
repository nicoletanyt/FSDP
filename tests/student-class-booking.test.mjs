import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('student class bookings enforce ownership, capacity and atomic moves', async () => {
  const db = new PGlite()
  const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
  const [alice, bob, admin, centre, noLimit, first, second, overlapping, noCapacity] =
    Array.from({ length: 9 }, (_, index) => id(index + 1))

  async function as(role, user, query, params = []) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
    await db.exec(`set role ${role}`)
    try {
      return (await db.query(query, params)).rows
    } finally {
      await db.exec('reset role')
    }
  }

  async function change(user, action, target, original = null) {
    const [row] = await as('authenticated', user,
      'select public.change_student_class_booking($1, $2, $3) as result',
      [action, target, original])
    return row.result
  }

  const session = (snapshot, eventId) => snapshot.sessions.find(event => event.id === eventId)

  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}',
        raw_app_meta_data jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth to authenticated, anon;
    `)
    for (const name of [
      '20261026120000_auth_roles',
      '20261102041227_reset_and_domain_schema',
      '20261109090712_student_class_booking'
    ]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
    }

    await db.query(`insert into auth.users(id,email,raw_app_meta_data) values
      ($1,'alice@example.test','{}'), ($2,'bob@example.test','{}'),
      ($3,'admin@example.test','{"role":"administrator"}')`, [alice, bob, admin])
    await db.query(`insert into public.centres(id,name,short_name,address,capacity) values
      ($1,'Limited','Limited','Test address',1), ($2,'No limit set','No limit','Test address',null)`, [centre, noLimit])
    await db.exec("insert into public.grades(id,label,sort_order) values ('unranked','Unranked',0) on conflict do nothing")
    await db.query(`insert into public.students (user_id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,joined_at) values
      ($1,'A','Alice','Test','alice@example.test',$3,'2000-01-01',current_date),
      ($2,'B','Bob','Test','bob@example.test',$3,'2000-01-01',current_date)`, [alice, bob, centre])
    await db.exec("insert into public.class_types(id,label) values ('test-class','Test class')")
    await db.query(`insert into public.events(id,event_type,centre_id,name,starts_at,ends_at) values
      ($1,'class',$5,'First',now()+interval '1 day',now()+interval '25 hours'),
      ($2,'class',$5,'Second',now()+interval '2 days',now()+interval '49 hours'),
      ($3,'class',$5,'Overlap',now()+interval '1 day 30 minutes',now()+interval '26 hours'),
      ($4,'class',$6,'No capacity',now()+interval '3 days',now()+interval '73 hours')`,
    [first, second, overlapping, noCapacity, centre, noLimit])
    await db.query("insert into public.classes(event_id,class_type_id) select id,'test-class' from public.events where id = any($1::uuid[])",
      [[first, second, overlapping, noCapacity]])

    await assert.rejects(as('anon', null, 'select public.student_class_schedule()'), /permission denied/)
    await assert.rejects(change(admin, 'enrol', first), /Sign in as a student/)
    await assert.rejects(change(alice, 'enrol', noCapacity), /capacity has not been configured/)
    assert.equal(session(await change(alice, 'enrol', first), first).booked, true)
    await assert.rejects(change(alice, 'enrol', first), /already enrolled/)
    await assert.rejects(change(alice, 'enrol', overlapping), /booking at that time/)
    await assert.rejects(change(bob, 'enrol', first), /class is full/)
    const waitlisted = session(await change(bob, 'join', first), first)
    assert.equal(waitlisted.booked, false)
    assert.equal(waitlisted.waitlisted, true)
    assert.equal(session(await change(bob, 'join', first), first).waitlisted, true)
    assert.deepEqual(await as('authenticated', alice, 'select event_id from public.class_waitlist'), [])
    await assert.rejects(change(bob, 'cancel', first), /No cancellable booking/)
    await assert.rejects(change(alice, 'reschedule', noCapacity, first), /capacity has not been configured/)
    const [unchanged] = await as('authenticated', alice, 'select public.student_class_schedule() as result')
    assert.equal(session(unchanged.result, first).booked, true)
    const moved = await change(alice, 'reschedule', second, first)
    assert.equal(session(moved, first).booked, false)
    assert.equal(session(moved, second).moved_from_event_id, first)
    assert.equal(session(await change(bob, 'enrol', first), first).waitlisted, false)
    await db.query("update public.event_students set attendance_status = 'late' where event_id = $1", [first])
    await assert.rejects(change(bob, 'cancel', first), /No cancellable booking/)
    const [attendance] = await as('authenticated', bob, 'select public.student_class_schedule() as result')
    assert.equal(session(attendance.result, first).attendance_status, 'late')
    assert.equal(session(await change(alice, 'cancel', second), second).booked, false)
  } finally {
    await db.close()
  }
})
