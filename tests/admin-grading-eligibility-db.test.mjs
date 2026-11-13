import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('live grading eligibility uses open events, deduplicates students and restricts access', async () => {
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
      create table public.grades(id text primary key, label text);
      create table public.students(id uuid primary key,first_name text,last_name text,date_of_birth date,
        home_centre_id uuid,current_grade_id text,joined_at date,last_graded_at date);
      create table public.events(id uuid primary key,status text,event_type text,starts_at timestamptz);
      create table public.gradings(event_id uuid,official_schedule boolean,application_status text,
        grading_date date,application_opens_on date,application_deadline date,track text);
      create table public.grade_requirements(grade_id text,track text,min_months int,max_months int,min_age_years int,min_sessions int);
      create table public.event_students(event_id uuid,student_id uuid,attendance_status text);
      create table public.syllabus_items(id text,grade_id text,track text,category text,sort_order int,label text);
      create table public.technique_sign_offs(student_id uuid,syllabus_item_id text);
      create function public.eligible_grading_students(target_event uuid)
      returns table(student_id uuid,target_grade_id text) language sql stable as $$
        select id, 'blue'::text from public.students where id='${id(10)}'::uuid $$;
      grant usage on schema public,auth to authenticated;
      grant execute on function auth.uid(),public.is_administrator(),public.eligible_grading_students(uuid) to authenticated;
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261111092311_admin_grading_eligibility.sql', import.meta.url), 'utf8'))
    await db.query("insert into public.users values ($1,'administrator'),($2,'student')", [id(1), id(2)])
    await db.query("insert into public.centres values ($1,'HQ')", [id(3)])
    await db.exec("insert into public.grades values ('unranked','Unranked'),('blue','Blue (6th Kyu)')")
    await db.query(`insert into public.students values ($1,'Alex','Tan','2000-01-01',$2,'unranked','2020-01-01',null),
      ($3,'Bob','Lim','2000-01-01',$2,'unranked','2020-01-01',null)`, [id(10), id(3), id(11)])
    await db.query("insert into public.events values ($1,'scheduled','grading',now()),($2,'scheduled','grading',now()),($3,'cancelled','grading',now())", [id(20), id(21), id(22)])
    await db.query(`insert into public.gradings values
      ($1,true,'open',current_date+20,current_date-1,current_date+10,'adult'),
      ($2,true,'open',current_date+25,current_date-1,current_date+10,'adult'),
      ($3,true,'open',current_date+25,current_date-1,current_date+10,'adult')`, [id(20), id(21), id(22)])
    await db.exec("insert into public.grade_requirements values ('blue','adult',3,null,null,2)")
    await db.query("insert into public.events values ($1,'scheduled','class',now())", [id(30)])
    await db.query("insert into public.event_students values ($1,$2,'present')", [id(30), id(10)])
    await db.exec("insert into public.syllabus_items values ('tech','blue','adult','techniques',1,'Roll')")
    await db.query("insert into public.technique_sign_offs values ($1,'tech')", [id(10)])
    assert.equal((await db.query("select has_function_privilege('anon','public.admin_grading_eligibility(uuid)','EXECUTE') allowed")).rows[0].allowed, false)
    await db.exec(`set request.jwt.claim.sub='${id(2)}'; set role authenticated`)
    await assert.rejects(() => db.query('select public.admin_grading_eligibility()'), /Administrator access required/)
    await db.exec(`reset role; set request.jwt.claim.sub='${id(1)}'; set role authenticated`)
    const all = (await db.query('select public.admin_grading_eligibility() result')).rows[0].result
    assert.equal(all.length, 1)
    assert.equal(all[0].id, id(10))
    assert.equal(all[0].sessions_attended, 1)
    assert.equal(all[0].techniques[0].signed, true)
    assert.equal(all[0].target_grade, 'Blue (6th Kyu)')
    assert.equal((await db.query('select public.admin_grading_eligibility($1) result', [id(21)])).rows[0].result.length, 1)
    assert.equal((await db.query('select public.admin_grading_eligibility($1) result', [id(22)])).rows[0].result.length, 0)
  } finally { await db.close() }
})
