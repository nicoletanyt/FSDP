import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [owner, other, student, otherStudent, adultEvent, childEvent, attempt] = [1, 2, 3, 4, 5, 6, 7].map(uuid)
const migration = name => readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')

test('official grading flow: verified payment, frozen dates, owner-scoped profile edits and idempotency', async suite => {
  const db = new PGlite()
  const as = async (role, user, query, args = []) => {
    await db.exec(`begin; set local role ${role}`)
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? ''])
      const result = await db.query(query, args)
      await db.exec('commit')
      return result.rows
    } catch (error) { await db.exec('rollback'); throw error }
  }
  const profile = user => as('authenticated', user, 'select public.my_grading_profile() as data').then(rows => rows[0].data)
  const save = (user, details) => as('authenticated', user, 'select public.save_my_grading_profile($1) as data', [details]).then(rows => rows[0].data)
  const finalize = (amount = 7700, currency = 'sgd', session = 'cs_test_grading') =>
    as('service_role', null, 'select public.finalize_grading_checkout($1,$2,$3,$4)', [attempt, session, amount, currency])
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
      create function public.current_user_role() returns text language sql stable as $$ select case when auth.uid() is not null then 'student' end; $$;
      grant usage on schema public,auth to anon,authenticated,service_role;
      create type public.application_status as enum ('submitted','under_review','withdrawn');
      create type public.grade_track as enum ('adult','children');
      create table public.students(id uuid primary key,user_id uuid unique,first_name text,last_name text,phone text,date_of_birth date,updated_at timestamptz);
      create table public.emergency_contacts(id uuid default gen_random_uuid(),student_id uuid,name text,relationship text,phone text,is_primary boolean);
      create unique index primary_contact on public.emergency_contacts(student_id) where is_primary;
      create table public.student_medical_alerts(id uuid default gen_random_uuid(),student_id uuid,description text,active boolean default true,recorded_at timestamptz default now());
      create table public.events(id uuid primary key,name text,status text,starts_at timestamptz);
      create table public.gradings(event_id uuid primary key,grading_date date,official_schedule boolean,track public.grade_track);
      create table public.grading_applications(id uuid primary key default gen_random_uuid(),student_id uuid,grading_event_id uuid,target_grade_id text,
        status public.application_status default 'submitted',submitted_at timestamptz default now(),unique(student_id,grading_event_id));
      create table public.grading_checkout_attempts(id uuid primary key default gen_random_uuid(),student_id uuid,grading_event_id uuid,target_grade_id text,
        stripe_session_id text unique,amount_cents integer,base_fee_cents integer,late_fee_cents integer,status text default 'pending',unique(student_id,grading_event_id));
      create table public.payments(student_id uuid,item text,description text,amount_cents integer,currency text,status text,stripe_session_id text unique,paid_at timestamptz);
      insert into public.students values('${student}','${owner}','Alex','Tan','91234567','2000-01-01',now()),
        ('${otherStudent}','${other}','Sam','Lim','92345678',make_date(extract(year from current_date)::int-8,1,1),now());
      insert into public.emergency_contacts values(gen_random_uuid(),'${student}','Mum','Mother','93333333',true);
      insert into public.student_medical_alerts(student_id,description) values('${student}','Staff-recorded allergy');
      insert into public.events values('${adultEvent}','Adult grading','scheduled',null),('${childEvent}','Children grading','scheduled',null);
      insert into public.gradings values('${adultEvent}',current_date+7,true,'adult'),('${childEvent}',current_date+8,true,'children');
      alter table public.grading_applications enable row level security;
      alter table public.emergency_contacts enable row level security;
      alter table public.student_medical_alerts enable row level security;
    `)
    await db.exec(await migration('20261115062900_student_profile_editing'))
    await db.exec(await migration('20261116054658_grading_application_flow'))

    await suite.test('profile reads are scoped to the authenticated student', async () => {
      assert.equal((await profile(owner)).full_name, 'Alex Tan')
      assert.deepEqual((await profile(owner)).recorded_medical_details, ['Staff-recorded allergy'])
      assert.equal((await profile(other)).emergency_name, '')
      await assert.rejects(as('anon', null, 'select public.my_grading_profile()'), /permission denied/)
    })
    await suite.test('editing saves contact and self-reported medical information without touching staff alerts', async () => {
      const details = { phone: '94444444', emergency_contact: { name: 'Dad', relationship: 'Father', phone: '95555555' }, medical_details: 'New knee injury' }
      const saved = await save(owner, details)
      assert.equal(saved.phone, '94444444')
      assert.equal(saved.emergency_name, 'Dad')
      assert.equal(saved.medical_details, 'New knee injury')
      assert.deepEqual(saved.recorded_medical_details, ['Staff-recorded allergy'])
      assert.equal((await profile(other)).medical_details, '')
      await assert.rejects(save(owner, { ...details, medical_details: 'x'.repeat(1001) }), /1,000/)
      await assert.rejects(save(owner, { ...details, emergency_contact: { ...details.emergency_contact, phone: 'bad' } }), /valid emergency/)
      await assert.rejects(save(owner, { ...details, full_name: 'Changed' }), /Complete/)
      assert.equal((await profile(owner)).full_name, 'Alex Tan')
      await save(owner, { ...details, medical_details: '' })
      assert.equal((await profile(owner)).medical_details, '')
      assert.deepEqual((await profile(owner)).recorded_medical_details, ['Staff-recorded allergy'])
    })
    await suite.test('official schedule uses calendar-year age groups', async () => {
      assert.deepEqual((await as('authenticated', owner, 'select id from public.my_official_grading_dates()')).map(row => row.id), [adultEvent])
      assert.deepEqual((await as('authenticated', other, 'select id from public.my_official_grading_dates()')).map(row => row.id), [childEvent])
    })
    await suite.test('grading prefill reads the private membership snapshot, exposes only an allowlist and is read-only', async () => {
      await db.exec(`
        create schema membership_private;
        revoke all on schema membership_private from public,anon,authenticated;
        create table membership_private.application_details(student_id uuid primary key,user_id uuid unique,form_data jsonb not null);
        alter table membership_private.application_details enable row level security;
      `)
      const form = { fullName: 'Alex Membership Tan', mobile: '96666666', emergencyName: 'Membership Parent',
        emergencyRelationship: 'Mother', emergencyPhone: '97777777', medicalDetails: 'Membership asthma note',
        nric: 'PRIVATE-NRIC', address: 'PRIVATE-ADDRESS', guardianNric: 'PRIVATE-GUARDIAN' }
      await db.query('insert into membership_private.application_details values($1,$2,$3)', [student, owner, form])
      // Reproduces the screenshot: contact values missing from the domain rows.
      await db.query('update public.students set phone=null where id=$1', [student])
      await db.query('delete from public.emergency_contacts where student_id=$1', [student])
      await db.exec(await migration('20261116061423_grading_membership_readonly_prefill'))
      const result = await profile(owner)
      assert.equal(result.full_name, form.fullName)
      assert.equal(result.phone, form.mobile)
      assert.equal(result.emergency_name, form.emergencyName)
      assert.equal(result.emergency_relationship, form.emergencyRelationship)
      assert.equal(result.emergency_phone, form.emergencyPhone)
      assert.equal(result.medical_details, 'Membership asthma note\nStaff-recorded allergy')
      assert.doesNotMatch(JSON.stringify(result), /PRIVATE-|nric|guardian|address|form_data/)
      const otherProfile = await profile(other)
      assert.equal(otherProfile.full_name, 'Sam Lim')
      assert.equal(otherProfile.phone, '92345678')
      assert.equal(otherProfile.emergency_name, '')
      assert.equal(otherProfile.medical_details, '')
      await assert.rejects(save(owner, { medical_details: 'changed' }), /permission denied/)
      await assert.rejects(as('authenticated', owner, 'select * from membership_private.application_details'), /permission denied/)
      await assert.rejects(as('anon', null, 'select public.my_grading_profile()'), /permission denied/)
      // Both identifiers must match; a stale/mislinked snapshot never leaks.
      await db.query('update membership_private.application_details set user_id=$1 where student_id=$2', [other, student])
      assert.equal((await profile(owner)).emergency_name, '')
      assert.equal((await profile(other)).emergency_name, '')
      await db.query('update membership_private.application_details set user_id=$1 where student_id=$2', [owner, student])
    })
    await suite.test('date is server-derived, frozen once checkout starts and duplicates cannot reserve the same day', async () => {
      await db.query(`insert into public.grading_checkout_attempts(id,student_id,grading_event_id,target_grade_id,amount_cents,base_fee_cents,late_fee_cents)
        values($1,$2,$3,'5-kyu',7700,5500,2200)`, [attempt, student, adultEvent])
      const before = (await db.query('select grading_date from public.grading_checkout_attempts')).rows[0].grading_date
      await db.query("update public.grading_checkout_attempts set stripe_session_id='cs_test_grading'")
      await db.query('update public.gradings set grading_date=grading_date+1 where event_id=$1', [adultEvent])
      await db.exec("update public.grading_checkout_attempts set grading_date=current_date+100")
      assert.deepEqual((await db.query('select grading_date from public.grading_checkout_attempts')).rows[0].grading_date, before)
      const duplicateEvent = uuid(8)
      await db.query("insert into public.events values($1,'Duplicate event','scheduled',null)", [duplicateEvent])
      await db.query("insert into public.gradings values($1,$2,true,'adult')", [duplicateEvent, before])
      await assert.rejects(db.query(`insert into public.grading_checkout_attempts(student_id,grading_event_id,target_grade_id) values($1,$2,'5-kyu')`, [student, duplicateEvent]), /unique constraint/)
    })
    await suite.test('students cannot finalize, insert applications or write medical rows directly', async () => {
      await assert.rejects(as('authenticated', owner, 'select public.finalize_grading_checkout($1,$2,7700,$3)', [attempt, 'cs_test_grading', 'sgd']), /permission denied/)
      await assert.rejects(as('authenticated', owner, "insert into public.grading_applications(student_id) values($1)", [student]), /permission denied/)
      await assert.rejects(as('authenticated', owner, "update public.student_medical_alerts set active=false"), /permission denied/)
    })
    await suite.test('mismatched payments cannot submit; verified retries produce one paid application and receipt', async () => {
      await assert.rejects(finalize(5500), /does not match/)
      await assert.rejects(finalize(7700, null), /does not match/)
      await assert.rejects(finalize(7700, 'usd'), /does not match/)
      await assert.rejects(finalize(7700, 'sgd', 'cs_forged'), /does not match/)
      assert.equal((await db.query('select * from public.grading_applications')).rows.length, 0)
      // A receipt conflict aborts the whole transaction, including the new
      // application. Stripe can retry once the operational conflict is resolved.
      await db.query("insert into public.payments(student_id,amount_cents,currency,status,stripe_session_id) values($1,1,'sgd','paid','cs_test_grading')", [otherStudent])
      await assert.rejects(finalize(), /receipt conflict/)
      assert.equal((await db.query('select * from public.grading_applications')).rows.length, 0)
      assert.equal((await db.query('select status from public.grading_checkout_attempts')).rows[0].status, 'pending')
      await db.exec("delete from public.payments where stripe_session_id='cs_test_grading'")
      await finalize()
      await finalize()
      const rows = await as('authenticated', owner, 'select * from public.my_grading_applications()')
      assert.equal(rows.length, 1)
      assert.equal(rows[0].status, 'under_review')
      assert.equal(rows[0].amount_paid_cents, 7700)
      assert.ok(rows[0].payment_confirmed_at)
      assert.deepEqual(rows[0].grading_date, (await db.query('select grading_date from public.grading_checkout_attempts')).rows[0].grading_date)
      assert.equal((await db.query('select * from public.payments')).rows.length, 1)
      assert.equal((await as('authenticated', other, 'select * from public.my_grading_applications()')).length, 0)
    })
  } finally { await db.close() }
})
