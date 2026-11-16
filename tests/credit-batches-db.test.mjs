import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('credit batches: verified grants, expiry, FEFO, refunds, no rescheduling, RLS and atomic rollback', async () => {
  const db = new PGlite()
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const [alice, bob, centre, first, second, third, fourth, fifth] = Array.from({ length: 8 }, (_, i) => id(i + 1))
  const migration = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8'))
  async function as(role, user, sql, params = []) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
    await db.exec(`set role ${role}`)
    try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
  }
  const book = (user, action, target, original = null) => as('authenticated', user,
    'select public.change_student_class_booking($1,$2,$3)', [action, target, original])
  const summary = async user => (await as('authenticated', user, 'select public.my_credit_summary() as result'))[0].result
  async function buy(session, pass = 'adult-10', credits = 10, unlimited = false, user = alice, paid = null) {
    return as('service_role', null, 'select public.finalize_credit_checkout($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [user, session, pass, pass, credits, unlimited, 'adult', 27000, 'sgd', paid ?? new Date().toISOString()])
  }
  async function batch(remaining, expires, user = alice) {
    return (await db.query(`insert into public.credit_batches(user_id,credits_total,credits_remaining,expires_at,source)
      values($1,$2,$2,now()+$3::interval,'legacy') returning id`, [user, remaining, expires])).rows[0].id
  }
  const remaining = async key => (await db.query('select credits_remaining as n from public.credit_batches where id=$1', [key])).rows[0].n
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
      '20261113120000_credit_checkout','20261109090712_student_class_booking']) await migration(name)
    await db.query("insert into auth.users(id,email) values($1,'alice@example.test'),($2,'bob@example.test')", [alice, bob])
    await db.query("insert into public.centres(id,name,short_name,address,capacity) values($1,'Dojo','Dojo','Test',2)", [centre])
    await db.exec("insert into public.grades(id,label,sort_order) values('unranked','Unranked',0) on conflict do nothing")
    await db.query(`insert into public.students(user_id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,joined_at)
      values($1,'A','Alice','Test','alice@example.test',$3,'2000-01-01',current_date),
      ($2,'B','Bob','Test','bob@example.test',$3,'2000-01-01',current_date)`, [alice, bob, centre])
    await db.exec("insert into public.class_types(id,label) values('test','Test')")
    for (const [index, event] of [first, second, third, fourth, fifth].entries()) {
      await db.query(`insert into public.events(id,event_type,centre_id,name,starts_at,ends_at)
        values($1,'class',$2,'Class',now()+$3::interval,now()+$4::interval)`, [event, centre, `${index + 1} days`, `${(index + 1) * 24 + 1} hours`])
      await db.query("insert into public.classes(event_id,class_type_id) values($1,'test')", [event])
    }
    await db.query('insert into public.credit_accounts(user_id,credits) values($1,20)', [alice])
    await migration('20261115064757_add_credit_batches')
    await migration('20261116061758_remove_class_reschedule')
    // Explicit privileges required by the service-only SECURITY INVOKER finalizer.
    await db.exec('grant select on public.users,public.students to service_role')

    assert.equal((await summary(alice)).credits, 20)
    const legacy = (await db.query('select source, expires_at::text as expires_at from public.credit_batches')).rows[0]
    assert.equal(legacy.source, 'legacy')
    assert.equal(legacy.expires_at, 'infinity')
    await buy('cs_one')
    await buy('cs_one')
    assert.equal((await summary(alice)).credits, 30)
    assert.equal((await db.query("select count(*)::int as n from public.credit_batches where stripe_session_id='cs_one'")).rows[0].n, 1)
    const validity = (await db.query(`select expires_at = ((created_at at time zone 'Asia/Singapore') + interval '11 weeks')
      at time zone 'Asia/Singapore' as valid from public.credit_batches where stripe_session_id='cs_one'`)).rows[0]
    assert.equal(validity.valid, true)
    await assert.rejects(buy('cs_one', 'adult-10', 10, false, bob), /duplicate key|identity mismatch/)
    await assert.rejects(buy('cs_bad', 'adult-10', 999), /amount mismatch/)

    // Month validity is calendar-based, not approximated as 120 days.
    await buy('cs_month', 'adult-25', 25, false, alice, '2026-01-31T12:00:00Z')
    assert.equal((await db.query("select expires_at = '2026-05-31T12:00:00Z'::timestamptz as valid from public.credit_batches where stripe_session_id='cs_month'")).rows[0].valid, true)
    // Isolate spending tests from grants and the legacy opening balance.
    await db.query('update public.credit_batches set expires_at=now()-interval \'1 second\' where user_id=$1', [alice])
    const late = await batch(2, '30 days')
    const early = await batch(1, '2 days') // inserted later, expires sooner
    const expired = await batch(9, '-1 day')
    assert.equal((await summary(alice)).credits, 3)
    assert.equal((await summary(alice)).expiring.credits, 1)
    await book(alice, 'enrol', first)
    assert.equal(await remaining(early), 0)
    assert.equal(await remaining(late), 2)
    await assert.rejects(book(alice, 'enrol', first), /already enrolled/)
    assert.equal((await summary(alice)).credits, 2)
    await book(alice, 'enrol', second)
    assert.equal(await remaining(late), 1)
    assert.equal(await remaining(expired), 9)
    // Rescheduling is gone: it's refused and nothing moves or is charged.
    await assert.rejects(book(alice, 'reschedule', third, second), /can't be rescheduled/)
    assert.equal((await summary(alice)).credits, 1)
    assert.equal((await db.query('select count(*)::int as n from public.event_students where event_id=$1', [third])).rows[0].n, 0)
    // Cancelling instead refunds to the original pass.
    await book(alice, 'cancel', second)
    assert.equal(await remaining(late), 2)
    await assert.rejects(book(alice, 'cancel', second), /No cancellable/)
    assert.equal(await remaining(late), 2)
    // Expiry after booking: refund is recorded, but does not revive expired credit.
    await db.query("update public.credit_batches set expires_at=now()-interval '1 second' where id=$1", [early])
    await book(alice, 'cancel', first)
    assert.equal(await remaining(early), 1)
    assert.equal((await summary(alice)).credits, 2)

    await db.query("update public.credit_batches set expires_at=now()-interval '1 second' where user_id=$1", [alice])
    await assert.rejects(book(alice, 'enrol', fourth), /No unexpired credits/)
    assert.equal((await db.query('select count(*)::int as n from public.event_students where event_id=$1', [fourth])).rows[0].n, 0)
    assert.equal((await summary(alice)).credits, 0)
    await buy('cs_unlimited', 'adult-3m', 9999, true)
    const finite = await batch(2, '4 days')
    assert.equal((await summary(alice)).unlimited, true)
    await book(alice, 'enrol', fourth)
    assert.equal(await remaining(finite), 2)
    await book(alice, 'cancel', fourth)
    assert.equal(await remaining(finite), 2)
    await db.query("update public.credit_batches set expires_at=now()-interval '1 second' where unlimited and user_id=$1", [alice])
    assert.equal((await summary(alice)).unlimited, false)
    await book(alice, 'enrol', fifth)
    assert.equal(await remaining(finite), 1)
    await book(alice, 'cancel', fifth)
    assert.equal(await remaining(finite), 2)

    // Competing requests for the last credit: at most one seat can commit.
    // PGlite serializes on one connection; hosted multi-connection load testing
    // remains separate from this transactional regression test.
    await db.query('update public.credit_batches set credits_total=1,credits_remaining=1 where id=$1', [finite])
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [alice])
    await db.exec('set role authenticated')
    let competing
    try {
      competing = await Promise.allSettled([fourth, fifth].map(event => db.query(
        "select public.change_student_class_booking('enrol',$1,null)", [event])))
    } finally { await db.exec('reset role') }
    assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(await remaining(finite), 0)
    const successful = competing[0].status === 'fulfilled' ? fourth : fifth
    await book(alice, 'cancel', successful)
    assert.equal(await remaining(finite), 1)

    // Full-class/waitlist/failed-move paths cannot lose or manufacture credits.
    await buy('cs_bob', 'adult-10', 10, false, bob)
    await db.query('update public.classes set booking_capacity=1 where event_id=$1', [first])
    await book(bob, 'enrol', first)
    await assert.rejects(book(alice, 'enrol', first), /full/)
    assert.equal(await remaining(finite), 1)
    await book(alice, 'join', first)
    await book(alice, 'leave', first)
    assert.equal(await remaining(finite), 1)
    await book(alice, 'enrol', second)
    await assert.rejects(book(alice, 'reschedule', first, second), /can't be rescheduled/)
    assert.equal(await remaining(finite), 0)
    assert.equal((await db.query('select count(*)::int as n from credit_private.booking_allocations where event_id=$1', [second])).rows[0].n, 1)
    await book(alice, 'cancel', second)
    await book(bob, 'cancel', first)
    assert.equal(await remaining(finite), 1)
    // Identical expiry timestamps are aggregated in the earliest-expiry warning.
    await db.query(`insert into public.credit_batches(user_id,credits_total,credits_remaining,expires_at,source)
      select user_id,1,1,expires_at,'legacy' from public.credit_batches where id=$1`, [finite])
    assert.equal((await summary(alice)).expiring.credits, 2)

    assert.ok((await as('authenticated', alice, 'select * from public.credit_batches')).length > 0)
    assert.ok((await as('authenticated', bob, 'select * from public.credit_batches')).every(row => row.user_id === bob))
    assert.ok((await as('authenticated', bob, 'select * from public.credit_batch_transactions')).every(row => row.user_id === bob))
    await assert.rejects(as('authenticated', alice, 'update public.credit_batches set credits_remaining=999'), /permission denied/)
    await assert.rejects(as('authenticated', alice, 'select student_calendar_private.change_booking_core($1,$2,null)', ['enrol', first]), /permission denied/)
    await assert.rejects(as('anon', null, 'select public.my_credit_summary()'), /permission denied/)
    await assert.rejects(as('authenticated', alice,
      "select public.finalize_credit_checkout($1,'fake','adult-10','Pass',10,false,'adult',27000,'sgd')", [alice]), /permission denied/)
    assert.equal((await db.query('select credits from public.credit_accounts where user_id=$1', [alice])).rows[0].credits, 2)
  } finally { await db.close() }
})
