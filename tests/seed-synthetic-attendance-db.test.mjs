import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('synthetic attendance uses suitable finished classes without touching other students or exceeding capacity', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create type public.attendance_status as enum ('present','late','absent','excused');
      create table public.centres(id uuid primary key,capacity integer);
      create table public.students(id uuid primary key,email text,home_centre_id uuid,date_of_birth date,joined_at date);
      create table public.events(id uuid primary key,centre_id uuid,event_type text,status text,starts_at timestamptz,ends_at timestamptz);
      create table public.classes(event_id uuid primary key,class_type_id text,booking_capacity integer);
      create table public.event_students(event_id uuid,student_id uuid,attendance_status public.attendance_status,
        recorded_at timestamptz,checked_in_at timestamptz,primary key(event_id,student_id));
    `)
    for (let centre = 0; centre < 30; centre++) {
      await db.query('insert into public.centres values ($1,5)', [id(centre + 1)])
      for (let n = 0; n < 5; n++) {
        const event = id(1000 + centre * 5 + n)
        await db.query(`insert into public.events values ($1,$2,'class','completed',
          now()-$3::integer*interval '1 day',now()-$3::integer*interval '1 day'+interval '1 hour')`,
        [event, id(centre + 1), n + 2])
        await db.query("insert into public.classes values ($1,'regular',5)", [event])
      }
      for (let n = 0; n < 5; n++) {
        const index = centre * 5 + n
        await db.query(`insert into public.students values ($1,$2,$3,'2000-01-01',
          (now() at time zone 'Asia/Singapore')::date - 30)`,
        [id(2000 + index), `synthetic.${index}@example.test`, id(centre + 1)])
      }
    }
    await db.query("insert into public.students values ($1,'other@example.test',$2,'2000-01-01',current_date - 30)",
      [id(9999), id(1)])
    await db.query("insert into public.event_students(event_id,student_id,attendance_status) values ($1,$2,'present')",
      [id(1000), id(9999)])
    await db.query(`insert into public.events values ($1,$2,'class','scheduled',now()+interval '1 day',now()+interval '1 day 1 hour')`,
      [id(9000), id(1)])
    await db.query('insert into public.event_students(event_id,student_id) values ($1,$2)', [id(9000), id(2000)])

    const seed = await readFile(new URL('../scripts/seed-synthetic-attendance-20261118.sql', import.meta.url), 'utf8')
    await db.exec(seed)
    const { rows: [result] } = await db.query(`
      select count(*) filter(where s.email like 'synthetic.%@example.test' and e.ends_at <= now()) synthetic_bookings,
        count(*) filter(where es.event_id = '${id(9000)}') future_bookings,
        count(*) filter(where s.email = 'other@example.test') other_bookings,
        count(distinct es.student_id) filter(where s.email like 'synthetic.%@example.test') assessed_students,
        count(*) filter(where es.attendance_status='absent' and s.email like 'synthetic.%@example.test') absences,
        count(*) filter(where es.attendance_status='excused' and s.email like 'synthetic.%@example.test') excused,
        count(*) filter(where es.attendance_status is null and s.email like 'synthetic.%@example.test') unmarked,
        count(*) filter(where es.recorded_at is null and es.attendance_status is not null
          and s.email like 'synthetic.%@example.test') missing_recorded_at,
        count(*) filter(where es.checked_in_at is not null and es.attendance_status not in ('present','late')
          and s.email like 'synthetic.%@example.test') bad_checkins,
        count(*) filter(where (e.centre_id <> s.home_centre_id or e.starts_at::date < s.joined_at)
          and s.email like 'synthetic.%@example.test' and e.ends_at <= now()) invalid_classes
      from public.event_students es join public.students s on s.id=es.student_id
      join public.events e on e.id=es.event_id`)
    assert.ok(result.synthetic_bookings >= 300 && result.synthetic_bookings <= 700)
    assert.equal(result.other_bookings, 1)
    assert.equal(result.future_bookings, 1)
    assert.ok(result.assessed_students > 100)
    assert.ok(result.absences > 100)
    assert.ok(result.excused > 0)
    assert.ok(result.unmarked > 0)
    assert.equal(result.missing_recorded_at, 0)
    assert.equal(result.bad_checkins, 0)
    assert.equal(result.invalid_classes, 0)
    const { rows: [max] } = await db.query(`select max(bookings) max_bookings from (
      select event_id,count(*) bookings from public.event_students group by event_id) x`)
    assert.ok(max.max_bookings <= 5)
    await assert.rejects(() => db.exec(seed), /already have finished or marked enrolments/)
    await db.exec('rollback')
    assert.equal((await db.query('select count(*) total from public.event_students')).rows[0].total,
      result.synthetic_bookings + 2)
  } finally { await db.close() }
})
