import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('student directory scopes live students and eligibility, and rejects non-admin callers', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.users(id uuid primary key, role text);
      create function public.is_administrator() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.users where id=auth.uid() and role='administrator') $$;
      create table public.centres(id uuid primary key, name text);
      create table public.grades(id text primary key,label text);
      create table public.students(id uuid primary key,member_no text,first_name text,last_name text,
        email text,date_of_birth date,home_centre_id uuid,current_grade_id text,membership_status text);
      create table public.events(id uuid primary key,status text);
      create table public.gradings(event_id uuid,official_schedule boolean,application_status text,
        grading_date date,application_opens_on date,application_deadline date);
      create function public.admin_attendance_monitoring(target_centre uuid default null)
      returns jsonb language sql stable as $$
        select coalesce(jsonb_agg(jsonb_build_object(
          'id',id, 'level',case when member_no='B' then 'at_risk' else 'healthy' end,
          'rate',case when member_no='B' then 40 else 100 end,
          'attended',2,'missed',2,'enrolments',4,'last_attended','2026-11-10'
        )), '[]'::jsonb) from public.students
        where target_centre is null or home_centre_id = target_centre $$;
      create function public.eligible_grading_students(target_event uuid)
      returns table(student_id uuid) language sql stable as $$
        select id from public.students where member_no='A' $$;
      grant usage on schema public,auth to authenticated;
      grant execute on function auth.uid(),public.is_administrator(),
        public.admin_attendance_monitoring(uuid),public.eligible_grading_students(uuid) to authenticated;
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261111031833_admin_student_directory.sql',import.meta.url),'utf8'))
    await db.query("insert into public.users values ($1,'administrator'),($2,'student')",[id(1),id(2)])
    await db.query("insert into public.centres values ($1,'One'),($2,'Two')",[id(20),id(21)])
    await db.exec("insert into public.grades values ('unranked','Unranked')")
    await db.query(`insert into public.students values
      ($1,'A','Alice','A','a@example.com','2000-01-01',$3,'unranked','active'),
      ($2,'B','Bob','B','b@example.com','2001-01-01',$4,'unranked','expired')`,
      [id(10),id(11),id(20),id(21)])
    await db.query("insert into public.events values ($1,'scheduled')",[id(50)])
    await db.query(`insert into public.gradings values ($1,true,'open',
      (now() at time zone 'Asia/Singapore')::date+20,
      (now() at time zone 'Asia/Singapore')::date-1,
      (now() at time zone 'Asia/Singapore')::date+10)`,[id(50)])
    assert.equal((await db.query("select has_function_privilege('anon','public.admin_student_directory(uuid)','EXECUTE') as allowed")).rows[0].allowed,false)
    await db.exec(`set request.jwt.claim.sub='${id(2)}'; set role authenticated`)
    await assert.rejects(() => db.query('select public.admin_student_directory()'),/Administrator access required/)
    await db.exec(`reset role; set request.jwt.claim.sub='${id(1)}'; set role authenticated`)
    const rows = (await db.query('select public.admin_student_directory() as result')).rows[0].result
    assert.equal(rows.length,2)
    assert.equal(rows[0].grading_status,'eligible')
    assert.equal(rows[0].membership_status,'active')
    assert.equal(rows[1].risk_level,'at_risk')
    assert.equal(rows[1].grading_status,'not_eligible')
    const scoped = (await db.query('select public.admin_student_directory($1) as result',[id(20)])).rows[0].result
    assert.equal(scoped.length,1)
    assert.equal(scoped[0].id,id(10))
    await assert.rejects(() => db.query('select public.admin_student_directory($1)',[id(99)]),/Centre not found/)
  } finally { await db.close() }
})
