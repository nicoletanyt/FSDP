import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('open late grading quotes $77, freezes issued sessions, and submits only after verified payment', async () => {
  const db = new PGlite()
  const user = '00000000-0000-4000-8000-000000000001'
  const student = '00000000-0000-4000-8000-000000000002'
  const event = '00000000-0000-4000-8000-000000000003'
  const centre = '00000000-0000-4000-8000-000000000004'
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      grant usage on schema auth, public to authenticated,service_role;
      create table public.students(id uuid primary key,user_id uuid,home_centre_id uuid,membership_status text,outstanding_fees boolean,email text);
      create table public.events(id uuid primary key,centre_id uuid,name text,status text,starts_at timestamptz);
      create table public.gradings(event_id uuid primary key,track text,official_schedule boolean,application_status text,
        grading_date date,application_opens_on date,application_deadline date);
      create table public.grades(id text primary key,label text);
      create table public.grade_requirements(grade_id text,track text);
      create table public.grading_target_grades(grading_event_id uuid,grade_id text);
      create table public.grading_applications(id uuid primary key default gen_random_uuid(), student_id uuid,grading_event_id uuid,target_grade_id text,
        unique(student_id,grading_event_id));
      create table public.grading_checkout_attempts(id uuid primary key default gen_random_uuid(),student_id uuid,grading_event_id uuid,target_grade_id text,
        stripe_session_id text unique,checkout_revision integer default 0,status text default 'pending',unique(student_id,grading_event_id));
      create table public.payments(student_id uuid,item text,description text,amount_cents integer,currency text,status text,stripe_session_id text unique,paid_at timestamptz);
      create table public.fixture_readiness(met boolean);
      insert into public.fixture_readiness values(true);
      create function public.student_grading_readiness(uuid) returns table(target_grade_id text,track text,met boolean)
        language sql as $$ select 'blue-gold-5th-kyu'::text,'adult'::text,met from public.fixture_readiness; $$;
      create function public.current_student_id() returns uuid language sql stable security definer set search_path='' as $$
        select id from public.students where user_id=(select auth.uid()); $$;
      create function public.reserve_grading_checkout(uuid,uuid) returns void language sql as $$ select; $$;
      insert into public.students values('${student}','${user}','${centre}','active',false,'student@example.test');
      insert into public.events values('${event}','${centre}','Adult grading','scheduled',now()+interval '7 days');
      insert into public.gradings values('${event}','adult',true,'open',
        (now() at time zone 'Asia/Singapore')::date+7,(now() at time zone 'Asia/Singapore')::date-30,(now() at time zone 'Asia/Singapore')::date-1);
      insert into public.grades values('blue-gold-5th-kyu','5th Kyu');
      insert into public.grade_requirements values('blue-gold-5th-kyu','adult');
      insert into public.grading_target_grades values('${event}','blue-gold-5th-kyu');
      -- Existing caller-scoped opportunities contract, as deployed before this migration.
      create function public.my_grading_opportunities()
      returns table(id uuid,name text,grading_date date,application_deadline date,centre_name text,venue_address text,target_grade text,applied boolean)
      language sql stable security definer set search_path='' as $$
        select e.id,e.name,g.grading_date,g.application_deadline,'Dojo'::text,'Address'::text,'blue-gold-5th-kyu'::text,false
        from public.events e join public.gradings g on g.event_id=e.id
        where exists(select 1 from public.students s where s.user_id=(select auth.uid())); $$;
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261113083930_grading_stripe_late_checkout.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261113090123_grading_fee_identifier_aliases.sql', import.meta.url), 'utf8'))

    const reserve = async () => (await db.query('select * from public.reserve_grading_checkout($1,$2)', [event,user])).rows[0]
    const quote = await reserve()
    assert.equal(quote.base_amount,5500)
    assert.equal(quote.late_amount,2200)
    assert.equal(quote.amount,7700)
    assert.equal((await db.query('select count(*)::int as n from public.grading_applications')).rows[0].n,0)

    await db.exec(`begin; set local role authenticated;`)
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user])
    const form = (await db.query('select * from public.my_grading_checkout_options()')).rows[0]
    assert.equal(form.total_amount,7700)
    assert.equal(form.late_amount,2200)
    await assert.rejects(reserve(), /permission denied/)
    await db.exec('rollback')

    // A valid older open Stripe session retains its original reviewed $55.
    await db.query("update public.grading_checkout_attempts set amount_cents=5500,base_fee_cents=5500,late_fee_cents=0,stripe_session_id='cs_old'")
    assert.equal((await reserve()).amount,5500)
    // Once the handler retires an expired session, the next quote includes late fees.
    await db.query('update public.grading_checkout_attempts set stripe_session_id=null,checkout_revision=checkout_revision+1')
    assert.equal((await reserve()).amount,7700)

    await db.query("update public.grading_checkout_attempts set stripe_session_id='cs_paid'")
    const finalize = (amount) => db.query("select public.finalize_grading_checkout($1,'cs_paid',$2,'sgd')", [quote.attempt_id,amount])
    await assert.rejects(finalize(5500),/Payment does not match/)
    await finalize(7700)
    await finalize(7700)
    assert.equal((await db.query('select count(*)::int as n from public.grading_applications')).rows[0].n,1)
    assert.equal((await db.query('select amount_cents from public.payments')).rows[0].amount_cents,7700)
    assert.equal((await db.query('select count(*)::int as n from public.payments')).rows[0].n,1)
    assert.equal((await db.query('select status from public.grading_checkout_attempts')).rows[0].status,'paid')

    // Check all eligibility guards independently with no prior application.
    await db.exec('delete from public.grading_applications')
    await db.query("update public.gradings set application_status='closed'")
    await assert.rejects(reserve(),/unavailable|ineligible/)
    await db.query("update public.gradings set application_status='open',grading_date=(now() at time zone 'Asia/Singapore')::date-1")
    await assert.rejects(reserve(),/unavailable|ineligible/)
    await db.query("update public.gradings set grading_date=(now() at time zone 'Asia/Singapore')::date+7")
    await db.query('update public.fixture_readiness set met=false')
    await assert.rejects(reserve(),/unavailable|ineligible/)
  } finally { await db.close() }
})
