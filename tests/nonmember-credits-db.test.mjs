import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('non-member credit is non-expiring, first booking creates the student at its dojo and is atomic', async () => {
  const db = new PGlite()
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const [student, centre, otherCentre, event, otherEvent, applicant] = Array.from({ length: 6 }, (_, i) => id(i + 1))
  const migrate = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
  async function as(role, user, sql, params = []) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
    await db.exec(`set role ${role}`)
    try { return (await db.query(sql, params)).rows }
    finally { await db.exec('reset role') }
  }
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',
        raw_app_meta_data jsonb default '{}',created_at timestamptz default now());
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
      $$;
      grant usage on schema auth,public to authenticated,anon,service_role;
    `)
    for (const name of ['20261026120000_auth_roles','20261102041227_reset_and_domain_schema',
      '20261105211923_membership_checkout','20261105225324_student_payments',
      '20261113120000_credit_checkout','20261109090712_student_class_booking',
      '20261114142809_membership_application_submit']) await migrate(name)
    await db.query("insert into auth.users(id,email) values($1,'new@example.test'),($2,'applicant@example.test')", [student, applicant])
    await db.query("insert into public.users(id,first_name,last_name,email,role) values($1,'New','Student','new@example.test','student'),($2,'An','Applicant','applicant@example.test','student') on conflict(id) do update set first_name=excluded.first_name,last_name=excluded.last_name", [student, applicant])
    await db.query("insert into public.centres(id,name,short_name,address,capacity) values($1,'Dojo One','D1','Test',3),($2,'Dojo Two','D2','Test',3)", [centre,otherCentre])
    await db.exec("insert into public.grades(id,label,sort_order) values('unranked','Unranked',0) on conflict do nothing")
    await db.exec("insert into public.class_types(id,label) values('test','Test')")
    await db.query("insert into public.events(id,event_type,centre_id,name,starts_at,ends_at) values($1,'class',$3,'One',now()+interval '1 day',now()+interval '1 day 1 hour'),($2,'class',$4,'Two',now()+interval '2 days',now()+interval '2 days 1 hour')", [event,otherEvent,centre,otherCentre])
    await db.query("insert into public.classes(event_id,class_type_id) values($1,'test'),($2,'test')", [event,otherEvent])
    await migrate('20261115064757_add_credit_batches')
    await migrate('20261116180000_nonmember_student_status')
    await migrate('20261116181000_nonmember_class_credits')
    const book = (user, target, dob) => as('authenticated',user,
      'select public.enrol_nonmember_class($1,$2) as result',[target,dob])
    const buy = (user, session, amount = 4000) => as('service_role',null,
      "select public.finalize_credit_checkout($1,$2,'nonmember-1','Single Class Credit',1,false,'non_member',$3,'sgd',now())",
      [user,session,amount])

    assert.equal((await as('authenticated', student, 'select public.student_class_schedule() as data'))[0].data.needs_profile, true)
    await db.query(`insert into public.students(user_id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,membership_status,joined_at)
      values($1,'applied','An','Applicant','applicant@example.test',$2,'2000-01-01','pending',current_date)`, [applicant,centre])
    await assert.rejects(book(applicant,event,'2000-01-01'), /existing student booking account/)
    await assert.rejects(book(student,event,'2000-01-01'), /No unexpired credits|active credit account|Insufficient credits/)
    assert.equal((await db.query('select count(*)::int as n from public.students where user_id=$1',[student])).rows[0].n, 0)
    await assert.rejects(buy(student,'cs_bad',3999), /amount mismatch/)
    await buy(student,'cs_one')
    await buy(student,'cs_one')
    assert.equal((await db.query("select count(*)::int as n from public.credit_batches where user_id=$1",[student])).rows[0].n, 1)
    assert.equal((await db.query("select expires_at::text as expiry from public.credit_batches where user_id=$1",[student])).rows[0].expiry, 'infinity')
    assert.equal((await as('authenticated',student,'select public.my_credit_summary() as data'))[0].data.credits, 1)
    await assert.rejects(book(student,event,'not-a-date'), /date|invalid/i)
    assert.equal((await db.query('select count(*)::int as n from public.students where user_id=$1',[student])).rows[0].n, 0)
    const booked = (await book(student,event,'2000-01-01'))[0].result
    assert.equal(booked.needs_profile, false)
    assert.equal(booked.linked, true)
    assert.equal((await db.query('select membership_status,home_centre_id from public.students where user_id=$1',[student])).rows[0].home_centre_id, centre)
    assert.equal((await as('authenticated',student,'select public.my_credit_summary() as data'))[0].data.credits, 0)
    assert.equal((await db.query('select count(*)::int as n from public.payments where student_id=(select id from public.students where user_id=$1)',[student])).rows[0].n, 1)
    await as('authenticated',student,'select public.change_student_class_booking($1,$2,$3)', ['cancel',event,null])
    assert.equal((await as('authenticated',student,'select public.my_credit_summary() as data'))[0].data.credits, 1)
    await as('authenticated',student,'select public.change_student_class_booking($1,$2,$3)', ['enrol',otherEvent,null])
    assert.equal((await db.query('select home_centre_id from public.students where user_id=$1',[student])).rows[0].home_centre_id, centre)
    await db.query(`insert into membership_private.application_details(student_id,user_id,form_data)
      select id,user_id,'{"membershipType":"adult"}'::jsonb from public.students where user_id=$1`, [student])
    assert.equal((await db.query('select membership_type from public.credit_accounts where user_id=$1',[student])).rows[0].membership_type, 'adult')
    await db.query("update public.students set membership_status='pending' where user_id=$1", [student])
    await assert.rejects(as('authenticated',student,'select public.change_student_class_booking($1,$2,$3)',
      ['enrol',event,null]), /active membership or non-member class credit/)
  } finally { await db.close() }
})
