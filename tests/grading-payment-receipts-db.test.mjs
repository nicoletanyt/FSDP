import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('verified grading payment receipts and review state commit atomically, idempotently and with owner-only reads', async () => {
  const db = new PGlite()
  const owner = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  const student = '00000000-0000-4000-8000-000000000003'
  const draft = '00000000-0000-4000-8000-000000000004'
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      create function public.is_administrator() returns boolean language sql stable as $$ select coalesce(current_setting('fixture.admin',true),'false')='true'; $$;
      grant usage on schema public,auth to authenticated,service_role;
      create type public.grade_track as enum ('adult','children');
      create table public.users(id uuid primary key);
      create table public.students(id uuid primary key,user_id uuid);
      create table public.grades(id text primary key);
      create table public.grading_applications(id uuid primary key);
      create table public.payments(id uuid primary key);
      insert into public.users values('${owner}'),('${other}');
      insert into public.students values('${student}','${owner}');
      insert into public.grades values('blue'),('gold');
      grant select on public.students to service_role;
    `)
    for (const migration of ['20261113135904_grading_application_drafts.sql', '20261113144249_grading_payment_receipts.sql']) {
      await db.exec(await readFile(new URL('../supabase/migrations/' + migration, import.meta.url), 'utf8'))
    }
    await db.exec('set role service_role')
    await db.query(`insert into public.grading_application_drafts
      (id,user_id,student_id,request_id,current_grade_id,target_grade_id,track,base_fee_cents,stripe_session_id,status)
      values ($1,$2,$3,$1,'blue','gold','adult',5500,'cs_test_paid','preview_paid')`, [draft, owner, student])
    const finalize = (overrides = {}) => {
      const p = { draft, owner, session: 'cs_test_paid', amount: 5500, currency: 'sgd', grade: 'gold', live: false, ...overrides }
      return db.query('select public.finalize_grading_preview_payment($1,$2,$3,$4,$5,$6,$7,$8) as id',
        [p.draft,p.owner,p.session,p.amount,p.currency,p.grade,p.live,'pi_test_saved'])
    }
    for (const overrides of [{ owner: other }, { amount: 1 }, { currency: 'usd' }, { grade: 'blue' }, { live: true }, { session: 'cs_wrong' }]) {
      await assert.rejects(finalize(overrides), /does not match/)
    }
    assert.equal((await db.query('select count(*)::int as n from public.grading_payment_receipts')).rows[0].n,0)
    assert.equal((await db.query('select status from public.grading_application_drafts')).rows[0].status,'preview_paid')
    const receipt = (await finalize()).rows[0].id
    assert.equal((await finalize()).rows[0].id,receipt)
    const saved = (await db.query('select * from public.grading_payment_receipts')).rows
    assert.equal(saved.length,1)
    assert.equal(saved[0].amount_cents,5500)
    assert.equal(saved[0].livemode,false)
    assert.equal(saved[0].stripe_session_id,'cs_test_paid')
    const request = (await db.query('select status,review_requested_at,payment_confirmed_at from public.grading_application_drafts')).rows[0]
    assert.equal(request.status,'pending_review')
    assert.ok(request.review_requested_at)
    assert.ok(request.payment_confirmed_at)
    await db.exec('reset role; set role authenticated')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])
    assert.equal((await db.query('select * from public.grading_payment_receipts')).rows.length,1)
    await assert.rejects(finalize(),/permission denied/)
    await assert.rejects(db.query("update public.grading_payment_receipts set amount_cents=1"),/permission denied/)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other])
    assert.equal((await db.query('select * from public.grading_payment_receipts')).rows.length,0)
    await db.exec("select set_config('fixture.admin','true',false)")
    assert.equal((await db.query('select * from public.grading_payment_receipts')).rows.length,1)
    await db.exec('reset role; set role anon')
    await assert.rejects(db.query('select * from public.grading_payment_receipts'),/permission denied/)
    await assert.rejects(finalize(),/permission denied/)
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int as n from public.grading_applications')).rows[0].n,0)
    assert.equal((await db.query('select count(*)::int as n from public.payments')).rows[0].n,0)
  } finally { await db.close() }
})
