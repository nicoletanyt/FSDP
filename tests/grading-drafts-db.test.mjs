import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('grading drafts persist with owner-only reads, service-only writes, and no formal application side effects', async () => {
  const db = new PGlite()
  const owner = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  const student = '00000000-0000-4000-8000-000000000003'
  const request = '00000000-0000-4000-8000-000000000004'
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      create function public.is_administrator() returns boolean language sql stable as $$ select coalesce(current_setting('fixture.admin',true),'false')='true'; $$;
      grant usage on schema public,auth to authenticated,service_role;
      create type public.grade_track as enum ('adult','children');
      create table public.users(id uuid primary key);
      create table public.students(id uuid primary key);
      create table public.grades(id text primary key);
      create table public.grading_applications(id uuid primary key);
      create table public.payments(id uuid primary key);
      insert into public.users values('${owner}'),('${other}');
      insert into public.students values('${student}');
      insert into public.grades values('blue'),('gold');
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261113135904_grading_application_drafts.sql', import.meta.url), 'utf8'))
    await db.exec('set role service_role')
    const draft = (await db.query(`insert into public.grading_application_drafts
      (user_id,student_id,request_id,current_grade_id,target_grade_id,track,base_fee_cents)
      values ($1,$2,$3,'blue','gold','adult',5500) returning id,status`, [owner,student,request])).rows[0]
    assert.equal(draft.status, 'draft')
    await db.query(`insert into public.grading_application_drafts
      (user_id,student_id,request_id,current_grade_id,target_grade_id,track,base_fee_cents)
      values ($1,$2,$3,'blue','gold','adult',5500) on conflict(user_id,request_id) do nothing`, [owner,student,request])
    assert.equal((await db.query('select count(*)::int as n from public.grading_application_drafts')).rows[0].n,1)
    await db.query("update public.grading_application_drafts set stripe_session_id='cs_test_saved',status='checkout_open' where id=$1", [draft.id])
    await db.exec('reset role; set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
    assert.equal((await db.query('select status from public.grading_application_drafts')).rows[0].status,'checkout_open')
    await assert.rejects(db.query("update public.grading_application_drafts set status='preview_paid'"),/permission denied/)
    await assert.rejects(db.query('delete from public.grading_application_drafts'),/permission denied/)
    await assert.rejects(db.query(`insert into public.grading_application_drafts(user_id) values($1)`,[owner]),/permission denied/)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other])
    assert.equal((await db.query('select * from public.grading_application_drafts')).rows.length,0)
    await db.exec("select set_config('fixture.admin','true',false)")
    assert.equal((await db.query('select * from public.grading_application_drafts')).rows.length,1)
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select * from public.grading_application_drafts'),/permission denied/)
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int as n from public.grading_applications')).rows[0].n,0)
    assert.equal((await db.query('select count(*)::int as n from public.payments')).rows[0].n,0)
  } finally { await db.close() }
})
