import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('admin overview uses live bookings, scoped students and official grading data without granting other roles access', async () => {
  const db = new PGlite()
  const as = async n => db.exec(`reset role; set request.jwt.claim.sub='${id(n)}'; set role authenticated;`)
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.users(id uuid primary key,role text not null);
      create function public.is_administrator() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.users where id=auth.uid() and role='administrator') $$;
      create table public.centres(id uuid primary key,name text);
      create table public.grades(id text primary key,label text);
      create table public.students(id uuid primary key,first_name text,last_name text,home_centre_id uuid,
        joined_at date,membership_status text,current_grade_id text);
      create table public.events(id uuid primary key,event_type text,centre_id uuid,status text,
        starts_at timestamptz,ends_at timestamptz);
      create table public.event_students(event_id uuid,student_id uuid,attendance_status text);
      create table public.gradings(event_id uuid,official_schedule boolean,application_status text,
        grading_date date,application_opens_on date,application_deadline date);
      create table public.grading_applications(student_id uuid);
      create table public.grading_email_sends(status text,recipient_count integer);
      create function public.eligible_grading_students(target_event uuid)
      returns table(student_id uuid) language sql stable as $$
        select id from public.students where id='${id(11)}'::uuid $$;
      grant usage on schema public,auth to authenticated;
      grant execute on function auth.uid(),public.is_administrator(),public.eligible_grading_students(uuid) to authenticated;
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261111010339_admin_overview_live.sql', import.meta.url), 'utf8'))
    await db.query("insert into public.users values ($1,'administrator'),($2,'student')",[id(1),id(2)])
    await db.query("insert into public.centres values ($1,'One'),($2,'Two')",[id(20),id(21)])
    await db.exec("insert into public.grades values ('unranked','Unranked')")
    await db.query(`insert into public.students values
      ($1,'Alice','No Bookings',$4,(now() at time zone 'Asia/Singapore')::date-40,'active','unranked'),
      ($2,'Bob','Missed',$4,(now() at time zone 'Asia/Singapore')::date-40,'active','unranked'),
      ($3,'Carol','Other Centre',$5,(now() at time zone 'Asia/Singapore')::date-40,'expired','unranked')`,
      [id(10),id(11),id(12),id(20),id(21)])
    for (let n=0; n<5; n++) {
      await db.query(`insert into public.events values ($1,'class',$2,'scheduled',
        (((now() at time zone 'Asia/Singapore')::date-$3::integer)+time '10:00') at time zone 'Asia/Singapore',
        (((now() at time zone 'Asia/Singapore')::date-$3::integer)+time '11:00') at time zone 'Asia/Singapore')`,[id(30+n),id(20),n+1])
      await db.query("insert into public.event_students values ($1,$2,'absent')",[id(30+n),id(11)])
    }
    await db.query(`insert into public.events values ($1,'class',$2,'scheduled',
      ((now() at time zone 'Asia/Singapore')::date-1+time '10:00') at time zone 'Asia/Singapore',
      ((now() at time zone 'Asia/Singapore')::date-1+time '11:00') at time zone 'Asia/Singapore')`,[id(40),id(21)])
    await db.query("insert into public.event_students values ($1,$2,'present')",[id(40),id(12)])
    await db.query(`insert into public.events values ($1,'grading',$2,'scheduled',
      ((now() at time zone 'Asia/Singapore')::date+20+time '10:00') at time zone 'Asia/Singapore',
      ((now() at time zone 'Asia/Singapore')::date+20+time '11:00') at time zone 'Asia/Singapore')`,[id(50),id(20)])
    await db.query(`insert into public.gradings values ($1,true,'open',
      (now() at time zone 'Asia/Singapore')::date+20,
      (now() at time zone 'Asia/Singapore')::date-1,
      (now() at time zone 'Asia/Singapore')::date+10)`,[id(50)])
    await db.query('insert into public.grading_applications values ($1)',[id(11)])
    await db.exec("insert into public.grading_email_sends values ('accepted',5),('failed',100)")

    await as(2)
    await assert.rejects(() => db.query('select public.admin_overview()'),/Administrator access required/)
    await as(1)
    const {rows:[{snapshot}]} = await db.query('select public.admin_overview() as snapshot')
    assert.equal(snapshot.total_students,3)
    assert.equal(snapshot.active_students,2)
    assert.equal(snapshot.attention_count,2)
    assert.equal(snapshot.critical_count,1)
    assert.equal(snapshot.attention_students.length,2)
    assert.equal(snapshot.attention_students[0].first_name,'Bob')
    assert.equal(snapshot.attention_students[0].consecutive,5)
    assert.equal(snapshot.attention_students[1].no_recent,true)
    assert.equal(snapshot.eligible_count,1)
    assert.equal(snapshot.open_gradings,1)
    assert.equal(snapshot.application_count,1)
    assert.equal(snapshot.invitation_recipients,5)
    assert.equal(snapshot.trend.length,12)
    assert.equal(snapshot.trend.reduce((total,point)=>total+point.sessions,0),6)

    const {rows:[{snapshot:scoped}]} = await db.query('select public.admin_overview($1) as snapshot',[id(20)])
    assert.equal(scoped.total_students,2)
    assert.equal(scoped.attention_count,2)
    assert.equal(scoped.trend.reduce((total,point)=>total+point.sessions,0),5)
    assert.equal(scoped.invitation_recipients,5)
    await assert.rejects(() => db.query('select public.admin_overview($1)',[id(99)]),/Centre not found/)

    // The Overview must use Monitoring's enrolment-based risk, not its former
    // 30-day/no-booking calculation; other overview figures stay intact.
    await db.exec(`reset role;
      create function public.admin_attendance_monitoring(target_centre uuid default null)
      returns jsonb language sql stable as $$
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', id, 'first_name', first_name, 'last_name', last_name,
          'grade', current_grade_id, 'level', case when id='${id(11)}'::uuid then 'critical' else 'unassessed' end,
          'missed', case when id='${id(11)}'::uuid then 5 else 0 end, 'enrolments', 5
        )), '[]'::jsonb) from public.students where target_centre is null or home_centre_id=target_centre
      $$;
      grant execute on function public.admin_attendance_monitoring(uuid) to authenticated;`)
    await db.exec(await readFile(new URL('../supabase/migrations/20261111022730_admin_overview_recent_enrolments.sql', import.meta.url), 'utf8'))
    await as(2)
    await assert.rejects(() => db.query('select public.admin_overview_recent_enrolments()'),/Administrator access required/)
    await as(1)
    const updated = (await db.query('select public.admin_overview_recent_enrolments() result')).rows[0].result
    assert.equal(updated.attention_count,1)
    assert.equal(updated.critical_count,1)
    assert.equal(updated.attention_students[0].first_name,'Bob')
    assert.equal(updated.attention_students[0].missed,5)
    assert.equal(updated.total_students,3)

    await db.exec(`reset role;
      create table public.admin_attendance_email_sends (
        student_id uuid, status text, created_at timestamptz, completed_at timestamptz
      );`)
    await db.exec(await readFile(new URL('../supabase/migrations/20261111161504_attendance_notified_window.sql', import.meta.url), 'utf8'))
    await as(1)
    const current = async () => (await db.query('select public.admin_overview_recent_enrolments() result')).rows[0].result
    assert.equal((await current()).attention_students[0].notified,false)
    await db.exec('reset role')
    await db.query(`insert into public.admin_attendance_email_sends values
      ($1,'failed',now()-interval '1 day',now()-interval '1 day'),
      ($1,'accepted',now()-interval '31 days',now()-interval '31 days'),
      ($1,'pending',now()-interval '1 day',null)`, [id(11)])
    await as(1)
    assert.equal((await current()).attention_students[0].notified,false)
    await db.exec('reset role')
    await db.query("insert into public.admin_attendance_email_sends values ($1,'accepted',now()-interval '29 days',now()-interval '29 days')",[id(11)])
    await as(1)
    assert.equal((await current()).attention_students[0].notified,true)
    assert.equal((await current()).attention_count,1)
    await db.exec('reset role')
    await db.query("update public.admin_attendance_email_sends set completed_at=now()-interval '31 days' where status='accepted'")
    await as(1)
    assert.equal((await current()).attention_students[0].notified,false)
    await as(2)
    await assert.rejects(() => db.query('select public.admin_overview_recent_enrolments()'),/Administrator access required/)
  } finally { await db.close() }
})
