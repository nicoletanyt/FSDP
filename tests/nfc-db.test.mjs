import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

test('NFC scans require a valid tag, an assigned class, and the class time window', async () => {
  const db = new PGlite()
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const [teacher, outsider, pupil, instructor, student, noClasses, current, future, past, unrelated, secondCurrent] =
    Array.from({ length: 11 }, (_, index) => id(index + 1))
  const tag = createHash('sha256').update('a'.repeat(64)).digest('hex')
  const otherTag = createHash('sha256').update('b'.repeat(64)).digest('hex')
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table public.users (id uuid primary key, role text not null);
      create table public.instructors (id uuid primary key, user_id uuid references public.users(id));
      create table public.students (id uuid primary key, first_name text not null, last_name text not null);
      create table public.events (id uuid primary key, instructor_id uuid, event_type text not null,
        status text not null, name text not null, starts_at timestamptz not null, ends_at timestamptz not null);
      create table public.event_students (event_id uuid not null references public.events(id),
        student_id uuid not null references public.students(id), attendance_status text,
        checked_in_at timestamptz, recorded_at timestamptz, primary key (event_id, student_id));
      grant usage on schema public to anon, authenticated, service_role;
    `)
    const sql = await readFile(new URL('../supabase/migrations/20261106132832_student_nfc_attendance.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    for (const [user, role] of [[teacher, 'instructor'], [outsider, 'instructor'], [pupil, 'student']]) {
      await db.query('insert into public.users values ($1,$2)', [user, role])
    }
    await db.query('insert into public.instructors values ($1,$2)', [instructor, teacher])
    await db.query("insert into public.students values ($1,'Test','Student'),($2,'Other','Student')", [student, noClasses])
    const dates = [
      [current, instructor, '+5 minutes', '+1 hour'],
      [future, instructor, '+20 minutes', '+2 hours'],
      [past, instructor, '-2 hours', '-1 hour'],
      [unrelated, null, '+5 minutes', '+1 hour'],
    ]
    for (const [event, assigned, start, end] of dates) {
      await db.query(`insert into public.events values ($1,$2,'class','scheduled','Lesson',
        now() + interval '${start}', now() + interval '${end}')`, [event, assigned])
    }
    for (const event of [current, future, past, unrelated]) {
      await db.query('insert into public.event_students values ($1,$2,null,null,null)', [event, student])
    }
    const scan = (actor, token, event = null) => db.query(
      'select public.nfc_scan_attendance($1,$2,$3) as result', [actor, token, event],
    ).then(({ rows }) => rows[0].result)
    assert.equal((await scan(teacher, tag)).status, 'invalid')
    await db.query('insert into public.student_nfc_tags(student_id,tag_id) values ($1,$2),($3,$4)',
      [student, tag, noClasses, otherTag])
    await assert.rejects(() => db.query('insert into public.student_nfc_tags(student_id,tag_id) values ($1,$2)', [noClasses, tag]))
    assert.equal((await scan(pupil, tag)).status, 'forbidden')
    assert.equal((await scan(outsider, tag)).status, 'unlinked')
    assert.equal((await scan(teacher, otherTag)).status, 'no_class')
    assert.equal((await scan(teacher, tag, unrelated)).status, 'wrong_class')
    assert.equal((await scan(teacher, tag, future)).status, 'upcoming')
    assert.equal((await scan(teacher, tag, past)).status, 'absent')
    const { rows: [pastRecord] } = await db.query('select attendance_status,checked_in_at from public.event_students where event_id=$1', [past])
    assert.deepEqual(pastRecord, { attendance_status: null, checked_in_at: null })
    // Exactly one eligible class wins over an earlier missed and later upcoming class.
    assert.equal((await scan(teacher, tag)).status, 'marked')
    const { rows: [futureRecord] } = await db.query('select attendance_status from public.event_students where event_id=$1', [future])
    assert.equal(futureRecord.attendance_status, null)
    assert.equal((await scan(teacher, tag)).already_marked, true)
    const { rows: [record] } = await db.query('select attendance_status,checked_in_at from public.event_students where event_id=$1', [current])
    assert.equal(record.attendance_status, 'present')
    assert.ok(record.checked_in_at)
    await db.query("update public.events set starts_at=now()-interval '90 minutes', ends_at=now()-interval '1 hour' where id=$1", [current])
    assert.equal((await scan(teacher, tag)).status, 'upcoming')
    await db.query("update public.event_students set attendance_status='excused' where event_id=$1", [future])
    assert.equal((await scan(teacher, tag, future)).status, 'excused')
    await db.query(`insert into public.events values ($1,$2,'class','scheduled','Another lesson',
      now() + interval '5 minutes',now() + interval '1 hour')`, [secondCurrent, instructor])
    await db.query('insert into public.event_students values ($1,$2,null,null,null)', [secondCurrent, student])
    assert.equal((await scan(teacher, tag)).status, 'marked')
    await db.query(`insert into public.events values ($1,$2,'class','scheduled','Third lesson',
      now() + interval '5 minutes',now() + interval '1 hour')`, [id(12), instructor])
    await db.query('insert into public.event_students values ($1,$2,null,null,null)', [id(12), student])
    const choice = await scan(teacher, tag)
    assert.equal(choice.status, 'select_class')
    assert.equal(choice.classes.length, 2)
    await db.query('delete from public.event_students where event_id=$1', [id(12)])
    await db.query('delete from public.events where id=$1', [id(12)])
    await db.query('update public.event_students set attendance_status=null, checked_in_at=null, recorded_at=null where event_id=$1', [secondCurrent])
    await db.query("update public.events set starts_at=now()-interval '30 minutes', ends_at=now()-interval '1 minute' where id=$1", [secondCurrent])
    assert.equal((await scan(teacher, tag)).status, 'excused')
    await db.query("update public.events set starts_at=now()-interval '2 hours', ends_at=now()-interval '1 hour' where id=$1", [future])
    assert.equal((await scan(teacher, tag)).status, 'absent')
    const { rows: [privileges] } = await db.query(`select
      has_function_privilege('authenticated','public.nfc_scan_attendance(uuid,text,uuid)','EXECUTE') as direct_scan,
      has_table_privilege('authenticated','public.student_nfc_tags','SELECT') as read_tags`)
    assert.deepEqual(privileges, { direct_scan: false, read_tags: false })
    await db.query('delete from public.student_nfc_tags where tag_id=$1', [tag])
    assert.equal((await scan(teacher, tag)).status, 'invalid')
  } finally {
    await db.close()
  }
})
