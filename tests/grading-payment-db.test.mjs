import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  student: '00000000-0000-4000-8000-000000000002',
  centre: '00000000-0000-4000-8000-000000000003',
  event: '00000000-0000-4000-8000-000000000004',
}

test('record_grading_payment saves a paid application for the signed-in student', async () => {
  const db = new PGlite()
  const sql = (query, parameters = []) => db.query(query, parameters)

  async function asUser(account, role, operation, { commit = false } = {}) {
    await db.exec(`begin; set local role ${role}`)
    try {
      await sql("select set_config('request.jwt.claim.sub', $1, true)", [account])
      const result = await operation()
      await db.exec(commit ? 'commit' : 'rollback')
      return result
    } catch (error) {
      await db.exec('rollback')
      throw error
    }
  }

  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text,
        raw_user_meta_data jsonb not null default '{}', raw_app_meta_data jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `)

    for (const filename of [
      '20261026120000_auth_roles.sql',
      '20261026130000_sync_trusted_roles.sql',
      '20261030120000_copilot_records.sql',
      '20261030130000_gpt_names.sql',
      '20261102041227_reset_and_domain_schema.sql',
      '20261103185301_grading_checkout.sql',
    ]) await db.exec(await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8'))

    await sql(`insert into public.centres(id,name,short_name,address) values
      ($1,'ASK Headquarters Dojo','test-hq','Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630')`, [ids.centre])

    for (const filename of ['20261104055444_official_grading_schedule.sql']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8'))
    }
    await db.exec(await readFile(new URL('../supabase/migrations/20261111120000_record_grading_payment.sql', import.meta.url), 'utf8'))

    await sql('insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,$3)',
      [ids.user, 'student@example.test', JSON.stringify({ role: 'student' })])

    await db.exec(`
      insert into public.grades (id,label,colour,is_ranked,sort_order) values
        ('unranked','Unranked',null,false,0), ('blue','Blue grade','Blue',true,10);
      insert into public.grade_tracks values ('unranked','adult'), ('blue','adult');
      insert into public.grade_requirements (grade_id,track,min_months,min_sessions) values ('blue','adult',0,null);
      insert into public.students (id,user_id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,current_grade_id,joined_at,last_graded_at)
      values ('${ids.student}','${ids.user}','MEM-001','Alex','Tan','student@example.test','${ids.centre}','2000-01-01','unranked',
        (now() at time zone 'Asia/Singapore')::date - interval '1 year',
        (now() at time zone 'Asia/Singapore')::date - interval '100 days');
      insert into public.events (id,event_type,centre_id,name,starts_at,ends_at,status) values
        ('${ids.event}','grading','${ids.centre}','Test grading',now()+interval '10 days',now()+interval '10 days 2 hours','scheduled');
      insert into public.gradings (event_id,track,grading_date,application_opens_on,application_deadline,reporting_release_on,application_status,official_schedule)
      values ('${ids.event}','adult',
        (now() at time zone 'Asia/Singapore')::date + 10,
        (now() at time zone 'Asia/Singapore')::date - 1,
        (now() at time zone 'Asia/Singapore')::date + 5,
        (now() at time zone 'Asia/Singapore')::date + 7,
        'open',true);
      insert into public.grading_target_grades values ('${ids.event}','blue');
    `)

    const saved = await asUser(ids.user, 'authenticated', async () => {
      const result = await sql('select * from public.record_grading_payment()')
      return result.rows[0]
    }, { commit: true })

    assert.equal(saved.grading_event_id, ids.event)
    assert.equal(saved.target_grade_id, 'blue')
    assert.ok(saved.application_id)
    assert.ok(saved.submitted_at)

    const stored = await sql(
      "select student_id, grading_event_id, target_grade_id, status, notes from public.grading_applications where id=$1",
      [saved.application_id],
    )
    assert.deepEqual(stored.rows[0], {
      student_id: ids.student,
      grading_event_id: ids.event,
      target_grade_id: 'blue',
      status: 'submitted',
      notes: 'Payment confirmed in student portal',
    })

    const retried = await asUser(ids.user, 'authenticated', async () => {
      const result = await sql('select * from public.record_grading_payment($1,$2)', [ids.event, 'blue'])
      return result.rows[0]
    })
    assert.equal(retried.application_id, saved.application_id)
    assert.equal((await sql('select count(*)::int as count from public.grading_applications')).rows[0].count, 1)

    await assert.rejects(
      () => asUser(null, 'authenticated', () => sql('select * from public.record_grading_payment(null, $1)', ['blue'])),
      /Authentication required/,
    )
    await assert.rejects(
      () => asUser(ids.user, 'anon', () => sql('select * from public.record_grading_payment($1, $2)', [ids.event, 'blue'])),
      /permission denied/i,
    )
  } finally {
    await db.close()
  }
})
