import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationsDir = new URL('../supabase/migrations/', import.meta.url)

test('membership application and checkout functions (offline PostgreSQL)', async (suite) => {
  const db = new PGlite()
  const ids = {
    student: '00000000-0000-4000-8000-0000000000a1',
    other: '00000000-0000-4000-8000-0000000000a2',
    instructor: '00000000-0000-4000-8000-0000000000a3',
  }

  async function asRole(role, userId, query) {
    await db.exec(`begin; set local role ${role};`)
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ''])
      return await query()
    } finally {
      await db.exec('rollback')
    }
  }

  try {
    // Emulate Supabase's built-in roles and the Auth objects the migrations use.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}',
        raw_app_meta_data jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
    `)
    // Later grading migrations depend on live seed data, so load only the base
    // domain schema plus the membership migration under test.
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .filter((f) => f <= '20261102041227_reset_and_domain_schema.sql' ||
        f.includes('membership_checkout') || f.includes('student_payments'))
      .sort()
    for (const file of files) {
      await db.exec(await readFile(new URL(file, migrationsDir), 'utf8'))
    }

    for (const [key, id] of Object.entries(ids)) {
      await db.query(`
        insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3);
      `, [id, `${key}@example.test`, key === 'instructor' ? '{"role":"instructor"}' : '{}'])
    }
    // Reference rows and Supabase's default table grants exist on the live
    // project but not in the migrations; RLS still applies to every read.
    await db.exec(`
      insert into public.grades (id, label, sort_order, is_ranked) values ('unranked', 'Unranked', 0, false);
      grant select on all tables in schema public to authenticated;
    `)
    const { rows: [centre] } = await db.query(`
      insert into public.centres (name, short_name) values ('Test Dojo', 'TST') returning id;
    `)

    const application = (overrides = {}) => JSON.stringify({
      first_name: 'Jess',
      last_name: 'Tan',
      phone: '+65 9123 4567',
      date_of_birth: '2004-05-06',
      home_centre_id: centre.id,
      emergency_contact: { name: 'Mum', relationship: 'Mother', phone: '+65 9000 0000' },
      medical_details: 'Asthma',
      ...overrides,
    })
    const submit = (user, app = application()) => db.query(
      'select * from public.submit_membership_application($1, $2::jsonb)', [user, app],
    )

    await suite.test('browsers cannot call either membership function', async () => {
      for (const sql of [
        `select public.submit_membership_application('${ids.student}', '{}'::jsonb)`,
        `select public.finalize_membership_checkout('${ids.student}', 'cs_x', 1000, 'sgd')`,
      ]) {
        for (const role of ['authenticated', 'anon']) {
          await assert.rejects(
            () => asRole(role, ids.student, () => db.exec(sql)),
            (error) => error.code === '42501',
          )
        }
      }
    })

    await suite.test('submitting creates a pending student whose member number is its UUID', async () => {
      const { rows: [result] } = await submit(ids.student)
      assert.equal(result.membership_status, 'pending')
      const { rows: [student] } = await db.query(
        'select * from public.students where user_id = $1', [ids.student],
      )
      assert.equal(student.id, result.student_id)
      assert.equal(student.member_no, student.id)
      assert.equal(student.email, 'student@example.test')
      assert.equal(student.membership_status, 'pending')
      const contacts = await db.query(
        'select name, is_primary from public.emergency_contacts where student_id = $1', [student.id],
      )
      assert.deepEqual(contacts.rows, [{ name: 'Mum', is_primary: true }])
    })

    await suite.test('resubmitting updates the same row and replaces the primary contact', async () => {
      await submit(ids.student, application({
        first_name: 'Jessie', emergency_contact: { name: 'Dad', relationship: 'Father', phone: '1' },
      }))
      const { rows } = await db.query(
        'select id, first_name from public.students where user_id = $1', [ids.student],
      )
      assert.equal(rows.length, 1)
      assert.equal(rows[0].first_name, 'Jessie')
      const contacts = await db.query(
        'select name from public.emergency_contacts where student_id = $1', [rows[0].id],
      )
      assert.deepEqual(contacts.rows, [{ name: 'Dad' }])
      const alerts = await db.query(
        'select count(*)::int as n from public.student_medical_alerts where student_id = $1', [rows[0].id],
      )
      assert.equal(alerts.rows[0].n, 1)
    })

    await suite.test('the student reads their own pending status through RLS', async () => {
      const { rows } = await asRole('authenticated', ids.student, () =>
        db.query('select membership_status from public.students where user_id = $1', [ids.student]))
      assert.deepEqual(rows, [{ membership_status: 'pending' }])
    })

    await suite.test('finalizing activates the membership idempotently', async () => {
      const { rows: [student] } = await db.query(
        'select id from public.students where user_id = $1', [ids.student],
      )
      // Checkout records a pending row first; the webhook then marks it paid (twice = no-op).
      await db.query(`
        insert into public.payments (student_id, item, description, amount_cents, stripe_session_id)
        values ($1, 'Membership', 'Membership fee', 1000, 'cs_test_1');
      `, [student.id])
      const finalize = 'select public.finalize_membership_checkout($1, $2, $3, $4)'
      await db.query(finalize, [student.id, 'cs_test_1', 1000, 'SGD'])
      await db.query(finalize, [student.id, 'cs_test_1', 1000, 'SGD'])
      const { rows } = await db.query(
        'select membership_status from public.students where id = $1', [student.id],
      )
      assert.equal(rows[0].membership_status, 'active')
      const payments = await db.query(
        'select status, amount_cents, currency, paid_at is not null as paid from public.payments where student_id = $1',
        [student.id],
      )
      assert.deepEqual(payments.rows, [{ status: 'paid', amount_cents: 1000, currency: 'sgd', paid: true }])
      await assert.rejects(() => db.query(finalize, ['00000000-0000-4000-8000-0000000000ff', 'cs_test_2', 1000, 'sgd']))
      await assert.rejects(() => db.query(finalize, [student.id, null, 1000, 'sgd']))
    })

    await suite.test('students read only their own payments', async () => {
      const own = await asRole('authenticated', ids.student, () =>
        db.query('select status from public.payments'))
      assert.deepEqual(own.rows, [{ status: 'paid' }])
      const other = await asRole('authenticated', ids.other, () =>
        db.query('select status from public.payments'))
      assert.equal(other.rows.length, 0)
      await assert.rejects(
        () => asRole('authenticated', ids.student, () => db.exec("update public.payments set status = 'refunded'")),
        (error) => error.code === '42501',
      )
      await assert.rejects(
        () => asRole('anon', null, () => db.exec('select * from public.payments')),
        (error) => error.code === '42501',
      )
    })

    await suite.test('an active member is never downgraded by resubmitting', async () => {
      const { rows: [result] } = await submit(ids.student, application({ first_name: 'Changed' }))
      assert.equal(result.membership_status, 'active')
      const { rows } = await db.query(
        'select first_name, membership_status from public.students where user_id = $1', [ids.student],
      )
      assert.deepEqual(rows[0], { first_name: 'Jessie', membership_status: 'active' })
    })

    await suite.test('invalid applications and non-students are rejected', async () => {
      for (const app of [
        application({ first_name: ' ' }),
        application({ date_of_birth: '2999-01-01' }),
        application({ date_of_birth: 'not-a-date' }),
        application({ home_centre_id: '00000000-0000-4000-8000-0000000000ff' }),
        application({ emergency_contact: {} }),
      ]) {
        await assert.rejects(() => submit(ids.other, app))
      }
      await assert.rejects(() => submit(ids.instructor))
      const { rows } = await db.query(
        'select count(*)::int as n from public.students where user_id = any($1::uuid[])',
        [[ids.other, ids.instructor]],
      )
      assert.equal(rows[0].n, 0)
    })

    await suite.test('an account cannot claim an existing student record by email', async () => {
      await db.query(`
        insert into public.students (member_no, first_name, last_name, email, home_centre_id, date_of_birth, joined_at)
        values ('SK-9999', 'Imported', 'Member', 'other@example.test', $1, '2000-01-01', current_date);
      `, [centre.id])
      await assert.rejects(() => submit(ids.other), /already belongs/)
    })
  } finally {
    await db.close()
  }
})
