import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { decoders } from './helpers/instructor-modules.mjs'

const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const ids = {
  admin: uuid(1), userA: uuid(2), userB: uuid(3), userStudent: uuid(4), unlinked: uuid(5),
  instructorA: uuid(11), instructorB: uuid(12), centreA: uuid(21), centreB: uuid(22),
  student: uuid(31), peer: uuid(32), unrelated: uuid(33), unassigned: uuid(34),
  ownPast: uuid(1000), ownFuture: uuid(1001), cancelled: uuid(1002), inProgress: uuid(1003),
  cycleEdge: uuid(1004), seminar: uuid(1005), grading: uuid(1006), unrecordedGrading: uuid(1007), unrelatedEvent: uuid(1008),
}

test('current-domain instructor reads, aggregates and report ownership (offline PostgreSQL)', async suite => {
  const db = new PGlite()
  const sql = (query, parameters = []) => db.query(query, parameters)
  async function asAccount(account, operation, role = 'authenticated') {
    await db.exec(`begin; set local role ${role}`)
    try {
      await sql("select set_config('request.jwt.claim.sub', $1, true)", [account ?? ''])
      return await operation()
    } finally {
      await db.exec('rollback')
    }
  }
  const rpc = async (name, parameters = [], casts = []) => {
    const result = await sql(`select public.${name}(${parameters.map((_, index) => `$${index + 1}${casts[index] ? `::${casts[index]}` : ''}`).join(',')}) as data`, parameters)
    return result.rows[0].data
  }
  const saveSession = (request, user, event, student, kind, expected, value) => rpc('save_instructor_session_record',
    [request, user, event, student, kind, JSON.stringify(expected), JSON.stringify(value)], ['uuid','uuid','uuid','uuid','text','jsonb','jsonb'])

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
      -- Exercise the direct REST write guard under Supabase-style defaults.
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `)

    for (const filename of [
      '20261026120000_auth_roles.sql', '20261026130000_sync_trusted_roles.sql',
      '20261030120000_copilot_records.sql', '20261030130000_gpt_names.sql',
      '20261102041227_reset_and_domain_schema.sql', '20261103185301_grading_checkout.sql',
      '20261104120000_instructor_reads.sql',
    ]) await db.exec(await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8'))

    // The fetched schedule migration expects the real deployment's venue to
    // exist. Supply that prerequisite only in this offline database, then apply
    // the cloud-only migration SQL unchanged before testing our instructor APIs.
    await sql(`insert into public.centres(name,short_name,address) values
      ('ASK Headquarters Dojo','official-test','Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630')`)
    for (const filename of [
      '20261104055444_official_grading_schedule.sql',
      '20261104094458_grading_invitation_wording.sql',
      '20261104115311_grading_invitation_track_dates.sql',
      '20261104153308_grading_invitation_link_position.sql',
      '20261104153902_grading_invitation_literal_link.sql',
    ]) await db.exec(await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8'))

    for (const [id, role] of [[ids.admin, 'administrator'], [ids.userA, 'instructor'], [ids.userB, 'instructor'],
      [ids.userStudent, 'student'], [ids.unlinked, 'instructor']]) {
      await sql('insert into auth.users (id,email,raw_app_meta_data) values ($1,$2,$3)',
        [id, `${id}@example.test`, JSON.stringify({ role })])
    }
    await db.exec(`
      insert into public.centres (id,name,short_name) values
        ('${ids.centreA}','First dojo','first'), ('${ids.centreB}','Second dojo','second');
      insert into public.grades (id,label,colour,is_ranked,sort_order) values
        ('unranked','Unranked',null,false,0), ('published-blue','Blue grade','Blue',true,10);
      insert into public.grade_tracks values ('unranked','adult'), ('published-blue','adult');
      insert into public.grade_requirements (grade_id,track,min_sessions) values ('published-blue','adult',20);
      insert into public.instructors (id,user_id,first_name,last_name,email) values
        ('${ids.instructorA}','${ids.userA}','First','Instructor','first@example.test'),
        ('${ids.instructorB}','${ids.userB}','Second','Instructor','second@example.test');
      insert into public.students (id,user_id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,current_grade_id,joined_at,last_graded_at) values
        ('${ids.student}','${ids.userStudent}','MEM-001','Alex','Same','one@example.test','${ids.centreA}','2000-01-01','published-blue','2020-01-01',(now() at time zone 'Asia/Singapore')::date - 60),
        ('${ids.peer}',null,'MEM%_002','Alex','Same','two@example.test','${ids.centreB}','2000-01-01','unranked','2020-01-01',null),
        ('${ids.unrelated}',null,'HIDDEN','Hidden','Student','hidden@example.test','${ids.centreB}','2000-01-01','unranked','2020-01-01',null),
        ('${ids.unassigned}',null,'NO-ENROLMENT','New','Visitor','visitor@example.test','${ids.centreB}','2000-01-01','unranked','2020-01-01',null);
      update public.students set membership_status='expired',outstanding_fees=true where id='${ids.unassigned}';
      insert into public.events (id,event_type,centre_id,instructor_id,name,starts_at,ends_at) values
        ('${ids.ownPast}','class','${ids.centreA}','${ids.instructorA}','First class',now()-interval '300 days',now()-interval '300 days'+interval '1 hour'),
        ('${ids.ownFuture}','class','${ids.centreA}','${ids.instructorA}','Next class',now()+interval '2 days',now()+interval '2 days 1 hour'),
        ('${ids.cancelled}','class','${ids.centreB}','${ids.instructorB}','Cancelled class',now()-interval '2 hours',now()-interval '1 hour'),
        ('${ids.inProgress}','class','${ids.centreB}','${ids.instructorB}','Current class',now()-interval '10 minutes',now()+interval '50 minutes'),
        ('${ids.cycleEdge}','class','${ids.centreB}','${ids.instructorB}','Cycle boundary',((now() at time zone 'Asia/Singapore')::date-60+time '00:15') at time zone 'Asia/Singapore',((now() at time zone 'Asia/Singapore')::date-60+time '01:15') at time zone 'Asia/Singapore'),
        ('${ids.seminar}','seminar','${ids.centreB}','${ids.instructorB}','Seminar',now()-interval '1 day',now()-interval '23 hours'),
        ('${ids.grading}','grading','${ids.centreA}','${ids.instructorA}','Recorded assessment',now()-interval '1 day',now()-interval '23 hours'),
        ('${ids.unrecordedGrading}','grading','${ids.centreA}','${ids.instructorA}','Unrecorded assessment',now()-interval '2 days',now()-interval '47 hours'),
        ('${ids.unrelatedEvent}','class','${ids.centreB}','${ids.instructorB}','Other student class',now()-interval '1 day',now()-interval '23 hours');
      update public.events set status='cancelled' where id='${ids.cancelled}';
      insert into public.gradings(event_id) values ('${ids.grading}'), ('${ids.unrecordedGrading}');
      insert into public.grading_target_grades values ('${ids.grading}','published-blue');
      insert into public.grading_applications(student_id,grading_event_id,target_grade_id) values ('${ids.student}','${ids.grading}','published-blue');
      insert into public.event_students(event_id,student_id,attendance_status) values
        ('${ids.ownPast}','${ids.student}','present'), ('${ids.ownPast}','${ids.peer}',null),
        ('${ids.ownFuture}','${ids.student}',null), ('${ids.ownFuture}','${ids.peer}',null),
        ('${ids.cancelled}','${ids.student}','present'), ('${ids.inProgress}','${ids.student}','present'),
        ('${ids.cycleEdge}','${ids.student}','present'), ('${ids.seminar}','${ids.student}','present'),
        ('${ids.grading}','${ids.student}','present'), ('${ids.unrecordedGrading}','${ids.student}',null),
        ('${ids.unrelatedEvent}','${ids.unrelated}','present');
      update public.event_students set report='Report by second instructor',report_author_id='${ids.instructorB}'
        where event_id='${ids.ownFuture}' and student_id='${ids.student}';
      update public.event_students set assessment_status='pending',assessment_notes='Recorded pending assessment'
        where event_id='${ids.grading}';
      insert into public.events (id,event_type,centre_id,instructor_id,name,starts_at,ends_at)
        select ('00000000-0000-4000-8000-'||lpad((2000+n)::text,12,'0'))::uuid,
          'class','${ids.centreB}','${ids.instructorB}','Other dojo class '||n,
          now()-make_interval(days=>n),now()-make_interval(days=>n)+interval '1 hour'
        from generate_series(1,125) n;
      insert into public.event_students(event_id,student_id,attendance_status,report,report_author_id)
        select ('00000000-0000-4000-8000-'||lpad((2000+n)::text,12,'0'))::uuid,'${ids.student}',
          case when n in (1,2) then 'absent' when n=3 then null when n=4 then 'excused' when n=5 then 'late' else 'present' end::public.attendance_status,
          case when n<=2 then 'Earlier report '||n else null end,
          case when n<=2 then '${ids.instructorB}'::uuid else null end
        from generate_series(1,125) n;
    `)

    // Seed above models accounts that predate automatic domain provisioning.
    await db.exec(await readFile(new URL('../supabase/migrations/20261104130000_instructor_availability.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261105120000_instructor_reference_policies.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261105130000_instructor_all_students.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261105140000_instructor_grading_reads.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261105150000_instructor_report_authors.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261105160000_instructor_attendance.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20261105170000_instructor_session_saves.sql', import.meta.url), 'utf8'))
    // Existing installations may already have the policies from manual SQL.
    await db.exec(await readFile(new URL('../supabase/migrations/20261105120000_instructor_reference_policies.sql', import.meta.url), 'utf8'))

    await suite.test('directory preserves authorized totals, facets, literal search and stable tie ordering', async () => {
      await asAccount(ids.userA, async () => {
        const first = await rpc('instructor_student_directory', ['', null, null, null, 1, 0], ['text', 'text', 'text', 'uuid', 'int', 'int'])
        assert.equal(decoders.decodeDirectory(first).items[0].student.id, ids.student)
        const second = await rpc('instructor_student_directory', ['', null, null, null, 1, 1], ['text', 'text', 'text', 'uuid', 'int', 'int'])
        assert.equal(first.total, 4)
        assert.equal(first.scopeTotal, 4)
        assert.deepEqual([first.items[0].id, second.items[0].id], [ids.student, ids.peer])
        assert.equal(first.facets.grades.length, 2)
        assert.equal(first.facets.centres.length, 2)
        assert.deepEqual(first.facets.colours, ['Blue'])
        const literal = await rpc('instructor_student_directory', ['%_'])
        assert.deepEqual(literal.items.map(item => item.id), [ids.peer])
        const filtered = await rpc('instructor_student_directory', ['', 'published-blue', 'Blue', ids.centreA])
        assert.equal(filtered.total, 1)
        assert.equal(filtered.scopeTotal, 4)
        assert.equal(filtered.facets.grades.length, 2)
        const beyond = await rpc('instructor_student_directory', ['', null, null, null, 10, 100], ['text', 'text', 'text', 'uuid', 'int', 'int'])
        assert.equal(beyond.total, 4)
        assert.deepEqual(beyond.items, [])
        assert.equal((await rpc('instructor_student_directory', ['HIDDEN'])).total, 1)
        const unassigned = (await rpc('instructor_student_directory', ['NO-ENROLMENT'])).items[0]
        assert.equal(unassigned.id, ids.unassigned)
        assert.equal(unassigned.membership_status, 'expired')
        assert.equal(unassigned.outstanding_fees, true)
      })
    })

    await suite.test('full history crosses instructors/dojos and pages beyond 100 rows without duplicates', async () => {
      await asAccount(ids.userA, async () => {
        const first = await rpc('instructor_student_history', [ids.student, 100, 0, 'class'], ['uuid', 'int', 'int', 'public.event_type'])
        const second = await rpc('instructor_student_history', [ids.student, 100, 100, 'class'], ['uuid', 'int', 'int', 'public.event_type'])
        assert.equal(first.total, 129)
        const combined = [...first.items, ...second.items]
        decoders.decodePage(first, decoders.decodeHistoryEntry)
        decoders.decodePage(second, decoders.decodeHistoryEntry)
        assert.equal(combined.length, first.total)
        assert.equal(new Set(combined.map(item => item.event.id)).size, first.total)
        assert.ok(combined.some(item => item.instructor.id === ids.instructorB && item.centre.id === ids.centreB))
        const visible = await sql('select * from public.event_students where student_id=$1', [ids.student])
        assert.ok(visible.rows.length > 125)
        const otherHistory = await sql('select * from public.event_students where student_id=$1', [ids.unrelated])
        assert.equal(otherHistory.rows.length, 1)
      })
      assert.equal((await asAccount(ids.userA, () => rpc('instructor_student_history', [ids.unrelated]))).total, 1)
      assert.equal((await asAccount(ids.userA, () => rpc('instructor_student_history', [ids.unassigned]))).total, 0)
      await assert.rejects(asAccount(ids.userA, () => rpc('instructor_student_history', [uuid(9999)])), { code: '42501' })
    })

    await suite.test('history filters preserve null attendance and only return recorded assessments', async () => {
      await asAccount(ids.userA, async () => {
        const assessments = await rpc('instructor_student_history', [ids.student, 50, 0, 'grading', null, false, false, true],
          ['uuid', 'int', 'int', 'public.event_type', 'public.attendance_status', 'boolean', 'boolean', 'boolean'])
        assert.equal(assessments.total, 1)
        assert.equal(assessments.items[0].record.assessment_status, 'pending')
        assert.equal(assessments.items[0].targetGrade.id, 'published-blue')
        const unmarked = await rpc('instructor_student_history', [ids.student, 50, 0, 'class', null, true],
          ['uuid', 'int', 'int', 'public.event_type', 'public.attendance_status', 'boolean'])
        assert.equal(unmarked.total, 1)
        assert.equal(unmarked.items[0].record.attendance_status, null)
        const oldest = await rpc('instructor_student_history', [ids.student, 1, 0, 'class', null, false, true],
          ['uuid', 'int', 'int', 'public.event_type', 'public.attendance_status', 'boolean', 'boolean'])
        assert.equal(oldest.items[0].event.id, ids.ownPast)
      })
    })

    await suite.test('summary uses all qualifying classes, Singapore cycle dates and honest status counts', async () => {
      const summary = await asAccount(ids.userA, () => rpc('instructor_student_summary', [ids.student]))
      decoders.decodeSummary(summary)
      assert.equal(summary.pastSessions, 127)
      assert.equal(summary.present, 122)
      assert.equal(summary.late, 1)
      assert.equal(summary.absent, 2)
      assert.equal(summary.excused, 1)
      assert.equal(summary.unmarked, 1)
      assert.equal(summary.cycleAttended, 57)
      assert.equal(summary.consecutiveAbsences, 2)
      assert.equal(summary.lastAttended.event.id, uuid(2005))
      const empty = await asAccount(ids.userA, () => rpc('instructor_student_summary', [ids.peer]))
      assert.equal(empty.present, 0)
      assert.equal(empty.unmarked, 1)
      assert.equal(empty.consecutiveAbsences, 0)
      assert.equal(empty.lastAttended, null)
      assert.equal(empty.cycleStart, '2020-01-01')
    })

    await suite.test('class reports batch real previous feedback and reject another instructor event', async () => {
      const reports = await asAccount(ids.userA, () => rpc('instructor_event_reports', [ids.ownFuture]))
      decoders.decodePage(reports, value => value) // Historical pre-removal RPC shape.
      assert.equal(reports.total, 2)
      assert.equal(reports.items[0].record.report_author_id, ids.instructorB)
      assert.equal(reports.items[0].reportAuthor.id, ids.instructorB)
      assert.equal(reports.items[0].reportAuthor.first_name, 'Second')
      assert.deepEqual(reports.items[0].previousReports.map(item => item.record.report), ['Earlier report 1', 'Earlier report 2'])
      assert.ok(reports.items[0].previousReports.every(item => item.centre.id === ids.centreB))
      assert.deepEqual(reports.items[1].previousReports, [])
      await assert.rejects(asAccount(ids.userA, () => rpc('instructor_event_reports', [uuid(2001)])), { code: '42501' })
      await assert.rejects(asAccount(ids.userA, () => rpc('instructor_event_reports', [ids.grading])), { code: '22023' })
    })

    await suite.test('event ownership never permits editing, claiming or deleting another author report', async () => {
      for (const mutation of [
        `update public.event_students set report='Changed' where event_id=$1 and student_id=$2`,
        `update public.event_students set report_author_id='${ids.instructorA}' where event_id=$1 and student_id=$2`,
        'delete from public.event_students where event_id=$1 and student_id=$2',
      ]) await assert.rejects(asAccount(ids.userA, () => sql(mutation, [ids.ownFuture, ids.student])), { code: '42501' })
      await asAccount(ids.userA, async () => {
        const result = await sql("update public.event_students set report=report where event_id=$1 and student_id=$2 returning report", [ids.ownFuture, ids.student])
        assert.equal(result.rows[0].report, 'Report by second instructor')
        const first = await saveSession(uuid(100001), ids.userA, ids.ownFuture, ids.peer, 'report', { report: null, reportAuthorId: null }, { report: 'Own report' })
        const own = await saveSession(uuid(100002), ids.userA, ids.ownFuture, ids.peer, 'report', first.value, { report: 'Own edit' })
        assert.equal(own.value.report, 'Own edit')
        const foreignEvent = await sql("update public.event_students set attendance_status='present' where event_id=$1 returning event_id", [uuid(2001)])
        assert.equal(foreignEvent.rows.length, 0)
      })
      await assert.rejects(asAccount(ids.userA, () => sql("update public.event_students set report='Spoof', report_author_id=$3 where event_id=$1 and student_id=$2", [ids.ownFuture, ids.peer, ids.instructorB])), { code: '42501' })
      await assert.rejects(asAccount(ids.userA, async () => {
        await sql('delete from public.event_students where event_id=$1 and student_id=$2', [ids.ownFuture, ids.peer])
        await sql("insert into public.event_students(event_id,student_id,report,report_author_id) values ($1,$2,'Spoof',$3)",
          [ids.ownFuture, ids.peer, ids.instructorB])
      }), { code: '42501' })
      await asAccount(ids.admin, () => sql("update public.event_students set report='Admin correction' where event_id=$1 and student_id=$2", [ids.ownFuture, ids.student]))
    })

    await suite.test('instructor reads depend on role rather than domain linkage; students and anonymous callers stay restricted', async () => {
      for (const [name, parameters] of [
        ['instructor_student_directory', []], ['instructor_student_history', [ids.student]],
        ['instructor_student_summary', [ids.student]], ['instructor_event_reports', [ids.ownFuture]],
      ]) {
        for (const account of [ids.userStudent, ids.admin]) {
          await assert.rejects(asAccount(account, () => rpc(name, parameters)), { code: '42501' })
        }
        await assert.rejects(asAccount(null, () => rpc(name, parameters), 'anon'), { code: '42501' })
      }
      const own = await asAccount(ids.userStudent, () => sql('select distinct student_id from public.event_students'))
      assert.deepEqual(own.rows.map(row => row.student_id), [ids.student])
      await asAccount(ids.unlinked, async () => {
        assert.equal(await rpc('current_instructor_id'), null)
        assert.equal((await rpc('instructor_student_directory')).total, 4)
        assert.equal((await rpc('instructor_student_history', [ids.unrelated])).total, 1)
        assert.equal((await rpc('instructor_student_summary', [ids.unassigned])).pastSessions, 0)
        assert.equal((await sql('select * from public.students')).rows.length, 4)
      })
      await assert.rejects(asAccount(ids.unlinked, () => rpc('instructor_event_reports', [ids.ownFuture])), { code: '42501' })
      await assert.rejects(asAccount(null, () => sql('select * from public.students'), 'anon'), { code: '42501' })
    })

    await suite.test('demotion revokes instructor identity and visibility despite a retained domain link', async () => {
      await sql("update public.users set role='student' where id=$1", [ids.userA])
      try {
        await asAccount(ids.userA, async () => {
          assert.equal(await rpc('current_instructor_id'), null)
          assert.equal((await sql('select * from public.students')).rows.length, 0)
          assert.equal((await sql('select * from public.event_students')).rows.length, 0)
        })
        await assert.rejects(asAccount(ids.userA, () => rpc('instructor_student_directory')), { code: '42501' })
      } finally {
        await sql("update public.users set role='instructor' where id=$1", [ids.userA])
      }
    })

    await suite.test('read helpers validate page limits and grade requirements enforce RLS', async () => {
      for (const [name, values, casts] of [
        ['instructor_student_directory', ['', null, null, null, 101, 0], ['text', 'text', 'text', 'uuid', 'int', 'int']],
        ['instructor_student_directory', ['', null, null, null, 10, -1], ['text', 'text', 'text', 'uuid', 'int', 'int']],
        ['instructor_student_history', [ids.student, 0], ['uuid', 'int']],
        ['instructor_event_reports', [ids.ownFuture, null], ['uuid', 'int']],
      ]) await assert.rejects(asAccount(ids.userA, () => rpc(name, values, casts)), { code: '22023' })
      const state = await sql("select relrowsecurity from pg_class where oid='public.grade_requirements'::regclass")
      assert.equal(state.rows[0].relrowsecurity, true)
      const readable = await asAccount(ids.userA, () => sql('select * from public.grade_requirements'))
      assert.equal(readable.rows.length, 1)
      assert.equal(readable.rows[0].grade_id, 'published-blue')
      await assert.rejects(asAccount(ids.userA, () => sql("insert into public.grade_requirements(grade_id,track) values ('unranked','children')")), { code: '42501' })
      await asAccount(ids.admin, () => sql("insert into public.grade_requirements(grade_id,track) values ('unranked','children')"))
    })
    await suite.test('directory pagination covers more than 100 rows and facets cover the full authorized scope', async () => {
      await db.exec('begin')
      try {
        await sql(`insert into public.students(id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,joined_at)
          select ('00000000-0000-4000-8000-'||lpad((5000+n)::text,12,'0'))::uuid,
            'PAGE-'||n,'Paging','Student','paging-'||n||'@example.test',$1,'2000-01-01','2020-01-01'
          from generate_series(1,120) n`, [ids.centreA])
        await sql(`insert into public.event_students(event_id,student_id)
          select $1,('00000000-0000-4000-8000-'||lpad((5000+n)::text,12,'0'))::uuid from generate_series(1,120) n`, [ids.ownPast])
        await db.exec('set local role authenticated')
        await sql("select set_config('request.jwt.claim.sub', $1, true)", [ids.userA])
        const first = await rpc('instructor_student_directory', ['', null, null, null, 100, 0], ['text', 'text', 'text', 'uuid', 'int', 'int'])
        const last = await rpc('instructor_student_directory', ['', null, null, null, 100, 100], ['text', 'text', 'text', 'uuid', 'int', 'int'])
        assert.equal(first.total, 124)
        assert.equal(first.scopeTotal, 124)
        assert.equal(first.items.length, 100)
        assert.equal(last.items.length, 24)
        assert.equal(new Set([...first.items, ...last.items].map(item => item.id)).size, 124)
        assert.deepEqual(last.facets, first.facets)
        assert.equal(first.facets.grades.length, 2)
        const filtered = await rpc('instructor_student_directory', ['', 'unranked'])
        assert.equal(filtered.total, 123)
        assert.equal(filtered.scopeTotal, 124)
        assert.equal(filtered.facets.grades.length, 2)
        assert.ok((await sql("select id from public.events where event_type='grading' and starts_at is null")).rows.length > 0)
        decoders.decodeDirectory(last)
      } finally {
        await db.exec('rollback')
      }
    })

    await suite.test('all-student SELECT access covers related data without expanding write permissions', async () => {
      const syllabus = 'fixture/unranked/item'
      await sql("insert into public.syllabus_items(id,grade_id,track,category,sort_order,label) values ($1,'unranked','adult','Basics',1,'Fixture item')", [syllabus])
      await sql("insert into public.emergency_contacts(student_id,name,relationship,phone) values ($1,'Contact','Parent','123')", [ids.unrelated])
      await sql("insert into public.student_medical_alerts(student_id,description) values ($1,'Fixture medical alert')", [ids.unrelated])
      await sql('insert into public.technique_sign_offs(student_id,syllabus_item_id,signed_off_by) values ($1,$2,$3)', [ids.unrelated, syllabus, ids.instructorB])
      await sql("insert into public.grading_applications(student_id,grading_event_id,target_grade_id) values ($1,$2,'published-blue')", [ids.unrelated, ids.grading])
      for (const account of [ids.userA, ids.unlinked]) {
        await asAccount(account, async () => {
          for (const table of ['emergency_contacts', 'student_medical_alerts', 'technique_sign_offs', 'grading_applications']) {
            assert.equal((await sql(`select * from public.${table} where student_id=$1`, [ids.unrelated])).rows.length, 1)
          }
          assert.equal((await sql("update public.students set phone='changed' where id=$1 returning id", [ids.unrelated])).rows.length, 0)
          assert.equal((await sql("update public.event_students set attendance_status='late' where student_id=$1 returning event_id", [ids.unrelated])).rows.length, 0)
          assert.equal((await sql('delete from public.technique_sign_offs where student_id=$1 returning id', [ids.unrelated])).rows.length, 0)
          assert.equal((await sql("update public.grading_applications set notes='changed' where student_id=$1 returning id", [ids.unrelated])).rows.length, 0)
        })
      }
      await assert.rejects(asAccount(ids.userA, () => sql('insert into public.technique_sign_offs(student_id,syllabus_item_id,signed_off_by) values ($1,$2,$3)',
        [ids.unassigned, syllabus, ids.instructorA])), { code: '42501' })
      await asAccount(ids.userStudent, async () => {
        assert.deepEqual((await sql('select id from public.students')).rows.map(row => row.id), [ids.student])
        assert.equal((await sql('select * from public.student_medical_alerts where student_id=$1', [ids.unrelated])).rows.length, 0)
      })
    })

    await suite.test('trusted instructor creation and promotion provision one linked domain row atomically', async () => {
      const newAccount = uuid(6)
      await sql(`insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
        values ($1,'new-instructor@example.test','{"first_name":"New","last_name":"Instructor"}','{"role":"instructor"}')`, [newAccount])
      const linked = await sql('select * from public.instructors where user_id=$1', [newAccount])
      assert.equal(linked.rows.length, 1)
      assert.notEqual(linked.rows[0].id, newAccount)
      assert.equal(linked.rows[0].first_name, 'New')
      assert.equal(linked.rows[0].email, 'new-instructor@example.test')
      await sql(`update auth.users set raw_app_meta_data='{"role":"instructor","other":"value"}' where id=$1`, [newAccount])
      assert.equal((await sql('select * from public.instructors where user_id=$1', [newAccount])).rows.length, 1)

      const signup = uuid(7)
      await sql(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'signup@example.test','{"role":"instructor"}')`, [signup])
      assert.equal((await sql('select * from public.instructors where user_id=$1', [signup])).rows.length, 0)
      await sql(`update auth.users set raw_app_meta_data='{"role":"instructor"}' where id=$1`, [signup])
      assert.equal((await sql('select * from public.instructors where user_id=$1', [signup])).rows.length, 1)

      const conflict = uuid(8)
      await sql(`insert into public.instructors(first_name,last_name,email) values ('Legacy','Record','conflict@example.test')`)
      await assert.rejects(sql(`insert into auth.users(id,email,raw_app_meta_data) values ($1,'conflict@example.test','{"role":"instructor"}')`, [conflict]), { code: '23505' })
      assert.equal((await sql('select * from auth.users where id=$1', [conflict])).rows.length, 0)
      assert.equal((await sql('select * from public.users where id=$1', [conflict])).rows.length, 0)
    })

    const futureDate = (await sql("select ((now() at time zone 'Asia/Singapore')::date + 10)::text as date")).rows[0].date
    const createSlot = (account, start = '08:30', end = '09:30', date = futureDate) =>
      rpc('create_instructor_availability', [account, date, start, end], ['uuid', 'date', 'time', 'time'])

    await suite.test('first availability save links an existing account and retries return the same slot', async () => {
      assert.equal((await sql('select * from public.instructors where user_id=$1', [ids.unlinked])).rows.length, 0)
      await asAccount(ids.unlinked, async () => {
        const saved = decoders.decodeAvailability(await createSlot(ids.unlinked))
        const linked = await rpc('current_instructor_id')
        assert.equal(saved.instructor_id, linked)
        assert.notEqual(saved.instructor_id, ids.unlinked)
        assert.equal((await createSlot(ids.unlinked)).id, saved.id)
        await createSlot(ids.unlinked, '09:30', '10:00')
        assert.equal((await sql('select * from public.instructor_availability')).rows.length, 2)
      })
    })

    await suite.test('failed first saves roll back the link and never claim an instructor by email', async () => {
      for (const [start, end, date] of [['07:00', '08:00', futureDate], ['09:00', '09:00', futureDate], ['21:00', '23:00', futureDate], ['08:00', '09:00', '2020-01-01']]) {
        await assert.rejects(asAccount(ids.unlinked, () => createSlot(ids.unlinked, start, end, date)), { code: 'PAV03' })
        assert.equal((await sql('select * from public.instructors where user_id=$1', [ids.unlinked])).rows.length, 0)
      }
      await sql('insert into public.instructors(first_name,last_name,email) values ($1,$2,$3)', ['Existing', 'Unlinked', `${ids.unlinked}@example.test`])
      try {
        await assert.rejects(asAccount(ids.unlinked, () => createSlot(ids.unlinked)), { code: 'PAV04' })
        const legacy = await sql('select user_id from public.instructors where email=$1', [`${ids.unlinked}@example.test`])
        assert.equal(legacy.rows[0].user_id, null)
      } finally {
        await sql('delete from public.instructors where email=$1', [`${ids.unlinked}@example.test`])
      }
    })

    await suite.test('availability writes enforce account, ownership and overlap rules on RPC and direct REST paths', async () => {
      for (const account of [ids.userStudent, ids.admin]) await assert.rejects(asAccount(account, () => createSlot(account)), { code: '42501' })
      await assert.rejects(asAccount(null, () => createSlot(ids.unlinked), 'anon'), { code: '42501' })
      await assert.rejects(asAccount(ids.userA, () => createSlot(ids.userB)), { code: '42501' })
      await asAccount(ids.userA, async () => {
        const saved = await createSlot(ids.userA)
        assert.equal(saved.instructor_id, ids.instructorA)
      })
      await assert.rejects(asAccount(ids.userA, async () => {
        await createSlot(ids.userA)
        await createSlot(ids.userA, '09:00', '10:00')
      }), { code: 'PAV01' })
      await assert.rejects(asAccount(ids.userA, () => sql(`insert into public.instructor_availability(instructor_id,date,start_time,end_time) values ($1,$2,'07:00','08:00')`, [ids.instructorA, futureDate])), { code: 'PAV03' })
      await assert.rejects(asAccount(ids.userA, () => sql(`insert into public.instructor_availability(instructor_id,date,start_time,end_time) values ($1,$2,'08:00','09:00')`, [ids.instructorB, futureDate])), { code: '42501' })

      const scheduled = uuid(3001)
      await sql(`insert into public.events(id,event_type,centre_id,instructor_id,name,starts_at,ends_at)
        values ($1,'class',$2,$3,'Scheduled event',($4::date+time '09:30') at time zone 'Asia/Singapore',($4::date+time '10:30') at time zone 'Asia/Singapore')`,
      [scheduled, ids.centreA, ids.instructorA, futureDate])
      await assert.rejects(asAccount(ids.userA, () => createSlot(ids.userA, '09:00', '10:00')), { code: 'PAV02' })
      await asAccount(ids.userA, () => createSlot(ids.userA, '08:30', '09:30'))
      await sql("update public.events set status='cancelled' where id=$1", [scheduled])
      await asAccount(ids.userA, () => createSlot(ids.userA, '09:00', '10:00'))
    })
    await suite.test('date-only calendar/history reads retain stored grading metadata and complete pages without widening instructor ownership', async () => {
      const firstId = uuid(7000)
      const date = (await sql("select ((now() at time zone 'Asia/Singapore')::date - 10)::text as value")).rows[0].value
      await sql(`insert into public.events(id,event_type,centre_id,instructor_id,name,starts_at,ends_at)
        select ('00000000-0000-4000-8000-'||lpad((7000+n)::text,12,'0'))::uuid,'grading',$1,$2,'Date-only grading '||n,null,null
        from generate_series(0,205) n`, [ids.centreA, ids.instructorA])
      await sql(`update public.events set instructor_id=$1 where id=$2`, [ids.instructorB, uuid(7205)])
      await sql(`insert into public.gradings(event_id,grading_date,reporting_release_on,reporting_time)
        select id,$1::date,$1::date-7,'10:30' from public.events where name like 'Date-only grading %'`, [date])
      await sql(`insert into public.event_students(event_id,student_id,assessment_status,assessment_notes)
        select id,$1,case when id=$2 then 'pending' else 'completed' end::public.assessment_status,'Stored date-only notes'
        from public.events where name like 'Date-only grading %'`, [ids.student, firstId])
      const from = `${date}T00:00:00+08:00`
      const to = (await sql("select (($1::date + 1)::text || 'T00:00:00+08:00') as value", [date])).rows[0].value
      const casts = ['timestamptz', 'timestamptz', 'int', 'int']
      await asAccount(ids.userA, async () => {
        const all = []
        for (const offset of [0, 100, 200]) {
          const page = decoders.decodePage(await rpc('instructor_calendar', [from, to, 100, offset], casts), decoders.decodeCalendarEntry)
          assert.equal(page.total, 205)
          all.push(...page.items)
        }
        assert.equal(new Set(all.map(item => item.event.id)).size, 205)
        assert.ok(all.every(item => item.event.instructor_id === ids.instructorA && item.event.starts_at === null && item.event.ends_at === null))
        assert.equal(all[0].grading.grading_date, date)
        assert.equal(all[0].grading.reporting_time, '10:30:00')
        const history = decoders.decodePage(await rpc('instructor_student_history', [ids.student, 100, 0, 'grading', null, false, false, true]), decoders.decodeHistoryEntry)
        assert.equal(history.total, 207)
        assert.ok(history.items.some(item => item.event.starts_at === null && item.grading.grading_date === date))
        const pending = decoders.decodePage(await rpc('instructor_student_history', [ids.student, 100, 100, 'grading', null, false, false, true]), decoders.decodeHistoryEntry)
        assert.ok(pending.items.every(item => item.targetGrade === null))
      })
      await asAccount(ids.unlinked, async () => {
        assert.equal((await rpc('instructor_calendar', [from, to, 100, 0], casts)).total, 0)
        assert.equal((await rpc('instructor_student_history', [ids.student, 100, 0, 'grading', null, false, false, true])).total, 207)
      })
      await asAccount(ids.userB, async () => {
        const calendar = decoders.decodePage(await rpc('instructor_calendar', [from, to, 100, 0], casts), decoders.decodeCalendarEntry)
        const timed = await sql('select count(*)::int as total from public.events where instructor_id=$1 and starts_at < $3::timestamptz and ends_at > $2::timestamptz', [ids.instructorB, from, to])
        assert.equal(calendar.total, timed.rows[0].total + 1) // Include every overlapping class, including midnight crossings, and the one date-only grading.
        assert.ok(calendar.items.every(item => item.event.instructor_id === ids.instructorB))
        assert.equal(calendar.items.filter(item => item.event.starts_at === null).length, 1)
      })
      await assert.rejects(asAccount(ids.userStudent, () => rpc('instructor_calendar', [from, to, 100, 0], casts)), { code: '42501' })
      await assert.rejects(asAccount(null, () => rpc('instructor_calendar', [from, to, 100, 0], casts), 'anon'), { code: '42501' })
      await assert.rejects(asAccount(ids.userA, () => rpc('instructor_calendar', [from, to, 101, 0], casts)), { code: '22023' })
    })
    await suite.test('report pages cover 205 students, preserve unknown authors and never manufacture earlier feedback', async () => {
      const reportEvent = uuid(7500)
      await sql(`insert into public.events(id,event_type,centre_id,instructor_id,name,starts_at,ends_at)
        values ($1,'class',$2,$3,'Report pagination class',now()+interval '7 days',now()+interval '7 days 1 hour')`,
      [reportEvent, ids.centreA, ids.instructorA])
      await sql(`insert into public.students(id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,current_grade_id,joined_at)
        select ('00000000-0000-4000-8000-'||lpad((9000+n)::text,12,'0'))::uuid,'REPORT-'||n,'Report','Member '||lpad(n::text,3,'0'),
          'report-'||n||'@example.test',$1,'2000-01-01','unranked','2020-01-01' from generate_series(0,204) n`, [ids.centreA])
      await sql(`insert into public.event_students(event_id,student_id,report)
        select $1,id,'Stored report with unknown author' from public.students where member_no like 'REPORT-%'`, [reportEvent])
      await asAccount(ids.userA, async () => {
        const rows = []
        for (const offset of [0, 100, 200]) {
          const page = decoders.decodePage(await rpc('instructor_event_reports', [reportEvent, 100, offset]), value => value)
          assert.equal(page.total, 205)
          rows.push(...page.items)
        }
        assert.equal(new Set(rows.map(item => item.record.student_id)).size, 205)
        assert.ok(rows.every(item => item.record.event_id === reportEvent && item.reportAuthor === null && item.previousReports.length === 0))
      })
      for (const account of [ids.userB, ids.userStudent, ids.unlinked]) {
        await assert.rejects(asAccount(account, () => rpc('instructor_event_reports', [reportEvent])), { code: '42501' })
      }
    })

    const snapshot = async (event, student) => (await sql(`select jsonb_build_object('studentId',student_id,'status',attendance_status,
      'recordedAt',recorded_at,'checkedInAt',checked_in_at) as data from public.event_students
      where event_id=$1 and ($2::uuid is null or student_id=$2) order by student_id`, [event, student ?? null])).rows.map(row => row.data)
    const saveAttendance = (request, user, event, scope, status, expected) => rpc('save_instructor_attendance',
      [request, user, event, scope, status, JSON.stringify(expected)], ['uuid', 'uuid', 'uuid', 'text', 'public.attendance_status', 'jsonb'])
    const expectedFailure = async (code, operation) => {
      await db.exec('savepoint attendance_failure')
      try { await assert.rejects(operation, { code }) } finally { await db.exec('rollback to attendance_failure; release attendance_failure') }
    }

    await suite.test('attendance saves/clears preserve reports, author, assessment and arrival fields; exact retries do not overwrite later saves', async () => {
      await sql("update public.event_students set assessment_notes='Existing assessment note',assessment_status='pending' where event_id=$1 and student_id=$2", [ids.ownFuture, ids.student])
      await asAccount(ids.userA, async () => {
        const original = (await sql('select * from public.event_students where event_id=$1 and student_id=$2', [ids.ownFuture, ids.student])).rows[0]
        const expected = await snapshot(ids.ownFuture, ids.student)
        const first = await saveAttendance(uuid(80001), ids.userA, ids.ownFuture, 'student', 'present', expected)
        decoders.decodeAttendanceSave(first)
        assert.equal(first.attendance[0].status, 'present')
        const after = (await sql('select * from public.event_students where event_id=$1 and student_id=$2', [ids.ownFuture, ids.student])).rows[0]
        assert.deepEqual({ ...after, attendance_status: original.attendance_status }, original)
        await saveAttendance(uuid(80002), ids.userA, ids.ownFuture, 'student', 'absent', await snapshot(ids.ownFuture, ids.student))
        assert.deepEqual(await saveAttendance(uuid(80001), ids.userA, ids.ownFuture, 'student', 'present', expected), first)
        assert.equal((await snapshot(ids.ownFuture, ids.student))[0].status, 'absent')
        await saveAttendance(uuid(80003), ids.userA, ids.ownFuture, 'student', null, await snapshot(ids.ownFuture, ids.student))
        assert.equal((await snapshot(ids.ownFuture, ids.student))[0].status, null)
        await expectedFailure('PAT01', () => saveAttendance(uuid(80001), ids.userA, ids.ownFuture, 'student', 'absent', expected))
        await expectedFailure('42501', () => sql("update public.event_students set attendance_status='present' where event_id=$1 and student_id=$2", [ids.ownFuture, ids.student]))
        await expectedFailure('42501', () => sql("insert into public.event_students(event_id,student_id,attendance_status) values ($1,$2,'present')", [ids.ownPast, ids.unassigned]))
        await expectedFailure('42501', () => sql('delete from public.event_students where event_id=$1 and student_id=$2', [ids.ownPast, ids.student]))
        await expectedFailure('42501', () => sql('update public.event_students set event_id=$1 where event_id=$2 and student_id=$3', [ids.ownFuture, ids.ownPast, ids.student]))
        await expectedFailure('42501', () => sql('select * from public.instructor_attendance_requests'))
      })
    })

    await suite.test('stale attendance or changed arrival evidence rejects the whole write without recording a receipt', async () => {
      await asAccount(ids.userA, async () => {
        const old = await snapshot(ids.ownFuture, ids.peer)
        await saveAttendance(uuid(80011), ids.userA, ids.ownFuture, 'student', 'present', old)
        await expectedFailure('PAT01', () => saveAttendance(uuid(80012), ids.userA, ids.ownFuture, 'student', 'absent', old))
        assert.equal((await snapshot(ids.ownFuture, ids.peer))[0].status, 'present')
        const wrongTime = (await snapshot(ids.ownFuture, ids.peer)).map(row => ({ ...row, checkedInAt: '2020-01-01T00:00:00Z' }))
        await expectedFailure('PAT01', () => saveAttendance(uuid(80013), ids.userA, ids.ownFuture, 'student', 'absent', wrongTime))
      })
      assert.equal((await sql('select count(*)::int as total from public.instructor_attendance_requests')).rows[0].total, 0)
    })

    await suite.test('bulk attendance is atomic over the complete 205-student roster and preserves protected late/excused entries', async () => {
      const event = uuid(7500)
      await sql("update public.event_students set attendance_status='late' where event_id=$1 and student_id=$2", [event, uuid(9000)])
      await sql("update public.event_students set attendance_status='excused' where event_id=$1 and student_id=$2", [event, uuid(9001)])
      const initial = await snapshot(event)
      await assert.rejects(asAccount(ids.userA, () => saveAttendance(uuid(80021), ids.userA, event, 'roster', 'present', initial.slice(0, 100))), { code: 'PAT01' })
      assert.deepEqual(await snapshot(event), initial)
      await asAccount(ids.userA, async () => {
        const result = await saveAttendance(uuid(80022), ids.userA, event, 'roster', 'present', initial)
        assert.equal(result.attendance.length, 205)
        assert.equal(result.attendance.filter(row => row.status === 'present').length, 203)
        assert.equal(result.attendance[0].status, 'late')
        assert.equal(result.attendance[1].status, 'excused')
        await expectedFailure('PAT03', () => saveAttendance(uuid(80023), ids.userA, event, 'student', null, result.attendance.slice(0, 1)))
        const before = await snapshot(event)
        await expectedFailure('PAT01', () => saveAttendance(uuid(80024), ids.userA, event, 'roster', 'absent', initial))
        assert.deepEqual(await snapshot(event), before)
        await saveAttendance(uuid(80025), ids.userA, event, 'roster', 'absent', before)
        const after = await snapshot(event)
        assert.equal(after.filter(row => row.status === 'absent').length, 203)
        assert.equal(after[0].status, 'late')
        assert.equal(after[1].status, 'excused')
      })
      await assert.rejects(asAccount(ids.userA, async () => {
        const before = await snapshot(event)
        await sql('insert into public.event_students(event_id,student_id) values ($1,$2)', [event, ids.student])
        await saveAttendance(uuid(80026), ids.userA, event, 'roster', 'present', before)
      }), { code: 'PAT01' })
      assert.deepEqual(await snapshot(event), initial)
    })

    await suite.test('arrival-based lateness is preserved and manual present marking never invents a check-in timestamp', async () => {
      const event = uuid(7500), student = uuid(9002)
      await sql("update public.event_students set attendance_status='present',recorded_at=(select starts_at+interval '6 minutes' from public.events where id=$1) where event_id=$1 and student_id=$2", [event, student])
      const before = await snapshot(event, student)
      await assert.rejects(asAccount(ids.userA, () => saveAttendance(uuid(80031), ids.userA, event, 'student', null, before)), { code: 'PAT03' })
      await asAccount(ids.userA, async () => {
        const result = await saveAttendance(uuid(80032), ids.userA, event, 'roster', 'absent', await snapshot(event))
        decoders.decodeAttendanceSave(result)
        assert.deepEqual(result.attendance.find(row => row.studentId === student), before[0])
      })
      assert.deepEqual(await snapshot(event, student), before)
    })

    await suite.test('attendance writes enforce role/account/event ownership and scheduled timed-session end boundaries', async () => {
      const expected = await snapshot(ids.ownFuture, ids.student)
      for (const user of [ids.userB, ids.userStudent, ids.unlinked, ids.admin]) {
        await assert.rejects(asAccount(user, () => saveAttendance(uuid(80041), user, ids.ownFuture, 'student', 'present', expected)), { code: '42501' })
      }
      await assert.rejects(asAccount(ids.userA, () => saveAttendance(uuid(80042), ids.userB, ids.ownFuture, 'student', 'present', expected)), { code: '42501' })
      await assert.rejects(asAccount(null, () => saveAttendance(uuid(80043), ids.userA, ids.ownFuture, 'student', 'present', expected), 'anon'), { code: '42501' })
      await assert.rejects(asAccount(ids.userA, () => saveAttendance(uuid(80044), ids.userA, ids.ownPast, 'student', 'present', [])), { code: '22023' })
      await assert.rejects(asAccount(ids.userA, () => saveAttendance(uuid(80045), ids.userA, ids.ownPast, 'student', 'present', [{ ...expected[0], status: 'present' }])), { code: 'PAT02' })
      for (const [index, status, untimed] of [[0, 'cancelled', false], [1, 'completed', false], [2, 'scheduled', true]]) {
        const event = uuid(81000 + index)
        await sql(`insert into public.events(id,event_type,centre_id,instructor_id,name,starts_at,ends_at,status)
          values ($1,'grading',$2,$3,'Read-only attendance',$4::timestamptz,$5::timestamptz,$6::public.event_status)`,
        [event, ids.centreA, ids.instructorA, untimed ? null : '2099-01-01T00:00:00Z', untimed ? null : '2099-01-01T01:00:00Z', status])
        await sql('insert into public.event_students(event_id,student_id) values ($1,$2)', [event, ids.student])
        await assert.rejects(asAccount(ids.userA, () => saveAttendance(uuid(80050 + index), ids.userA, event, 'student', 'present', expected)), { code: 'PAT02' })
      }
    })

    await suite.test('committed attendance survives a new read transaction; receipts cannot bypass demotion or mutate a closed session', async () => {
      const expected = await snapshot(ids.ownFuture, ids.peer)
      await db.exec('begin; set local role authenticated')
      let saved
      try {
        await sql("select set_config('request.jwt.claim.sub',$1,true)", [ids.userA])
        saved = await saveAttendance(uuid(80091), ids.userA, ids.ownFuture, 'student', 'present', expected)
        await db.exec('commit')
      } catch (error) { await db.exec('rollback'); throw error }
      assert.equal((await asAccount(ids.userA, () => snapshot(ids.ownFuture, ids.peer)))[0].status, 'present')
      const receipt = (await sql('select user_id,response from public.instructor_attendance_requests where request_id=$1', [uuid(80091)])).rows[0]
      assert.equal(receipt.user_id, ids.userA)
      assert.deepEqual(receipt.response, saved)
      await sql("update public.users set role='student' where id=$1", [ids.userA])
      try {
        assert.equal((await sql('select count(*)::int as count from public.instructors where user_id=$1', [ids.userA])).rows[0].count, 1)
        await assert.rejects(asAccount(ids.userA, () => saveAttendance(uuid(80091), ids.userA, ids.ownFuture, 'student', 'present', expected)), { code: '42501' })
      } finally { await sql("update public.users set role='instructor' where id=$1", [ids.userA]) }
      await sql("update public.events set status='completed' where id=$1", [ids.ownFuture])
      assert.deepEqual(await asAccount(ids.userA, () => saveAttendance(uuid(80091), ids.userA, ids.ownFuture, 'student', 'present', expected)), saved)
      await assert.rejects(asAccount(ids.userA, () => saveAttendance(uuid(80092), ids.userA, ids.ownFuture, 'student', 'absent', saved.attendance)), { code: 'PAT02' })
      assert.equal((await snapshot(ids.ownFuture, ids.peer))[0].status, 'present')
      await assert.rejects(asAccount(ids.userB, () => sql('select * from public.instructor_attendance_requests')), { code: '42501' })
    })
    await suite.test('reports derive domain authorship and preserve unrelated fields across add/edit/clear and exact retries', async () => {
      await asAccount(ids.userA, async () => {
        const before = (await sql('select * from public.event_students where event_id=$1 and student_id=$2', [ids.ownPast, ids.peer])).rows[0]
        const expected = { report: before.report, reportAuthorId: before.report_author_id }
        const first = await saveSession(uuid(101001), ids.userA, ids.ownPast, ids.peer, 'report', expected, { report: '  Stored report\nSecond line  ', reportAuthorId: ids.instructorB })
        assert.equal(first.kind, 'report') // Historical migration behavior, not a current API response.
        assert.equal(first.value.report, 'Stored report\nSecond line')
        assert.equal(first.value.reportAuthorId, ids.instructorA)
        assert.notEqual(first.value.reportAuthorId, ids.userA)
        const after = (await sql('select * from public.event_students where event_id=$1 and student_id=$2', [ids.ownPast, ids.peer])).rows[0]
        assert.deepEqual({ ...after, report: before.report, report_author_id: before.report_author_id }, before)
        const edited = await saveSession(uuid(101002), ids.userA, ids.ownPast, ids.peer, 'report', first.value, { report: 'Newer report' })
        assert.deepEqual(await saveSession(uuid(101001), ids.userA, ids.ownPast, ids.peer, 'report', expected, { report: 'Stored report\nSecond line' }), first)
        assert.equal((await sql('select report from public.event_students where event_id=$1 and student_id=$2', [ids.ownPast, ids.peer])).rows[0].report, 'Newer report')
        const cleared = await saveSession(uuid(101003), ids.userA, ids.ownPast, ids.peer, 'report', edited.value, { report: '   ' })
        assert.equal(cleared.value.report, null)
        assert.equal(cleared.value.reportAuthorId, ids.instructorA)
        await expectedFailure('PRS01', () => saveSession(uuid(101004), ids.userA, ids.ownPast, ids.peer, 'report', first.value, { report: 'Stale edit' }))
        await expectedFailure('PRS01', () => saveSession(uuid(101001), ids.userA, ids.ownPast, ids.peer, 'report', expected, { report: 'Different retry' }))
        await expectedFailure('42501', () => sql("update public.event_students set report='Direct edit' where event_id=$1 and student_id=$2", [ids.ownPast, ids.peer]))
        await expectedFailure('42501', () => sql('select * from public.instructor_session_write_requests'))
      })
    })

    await suite.test('another or unknown report author cannot be claimed, and saved records cannot be removed or re-keyed through REST', async () => {
      const existing = { report: 'Report by second instructor', reportAuthorId: ids.instructorB }
      await assert.rejects(asAccount(ids.userA, () => saveSession(uuid(101011), ids.userA, ids.ownFuture, ids.student, 'report', existing, { report: 'Claimed' })), { code: 'PRS02' })
      await sql("update public.event_students set report='Unknown author report',report_author_id=null where event_id=$1 and student_id=$2", [ids.ownPast, ids.student])
      await assert.rejects(asAccount(ids.userA, () => saveSession(uuid(101012), ids.userA, ids.ownPast, ids.student, 'report', { report: 'Unknown author report', reportAuthorId: null }, { report: 'Claimed' })), { code: 'PRS02' })
      for (const statement of [
        'delete from public.event_students where event_id=$1 and student_id=$2',
        `update public.event_students set event_id='${ids.ownPast}' where event_id=$1 and student_id=$2`,
      ]) await assert.rejects(asAccount(ids.userA, () => sql(statement, [ids.ownFuture, ids.student])), { code: '42501' })
    })

    await suite.test('assessment saves preserve reports, attendance, grade and application state, and competing notes/status require reload', async () => {
      await sql("update public.event_students set report='Report by another instructor',report_author_id=$3 where event_id=$1 and student_id=$2", [ids.grading, ids.student, ids.instructorB])
      const before = (await sql('select * from public.event_students where event_id=$1 and student_id=$2', [ids.grading, ids.student])).rows[0]
      const gradeBefore = (await sql('select current_grade_id from public.students where id=$1', [ids.student])).rows[0]
      const applicationBefore = (await sql('select * from public.grading_applications where grading_event_id=$1 and student_id=$2', [ids.grading, ids.student])).rows
      await asAccount(ids.userA, async () => {
        const expected = { status: before.assessment_status, notes: before.assessment_notes }
        const first = await saveSession(uuid(101021), ids.userA, ids.grading, ids.student, 'assessment', expected, { status: 'completed', notes: 'Recorded completed notes' })
        decoders.decodeSessionSave(first)
        const after = (await sql('select * from public.event_students where event_id=$1 and student_id=$2', [ids.grading, ids.student])).rows[0]
        assert.deepEqual({ ...after, assessment_status: before.assessment_status, assessment_notes: before.assessment_notes }, before)
        assert.deepEqual((await sql('select current_grade_id from public.students where id=$1', [ids.student])).rows[0], gradeBefore)
        assert.deepEqual((await sql('select * from public.grading_applications where grading_event_id=$1 and student_id=$2', [ids.grading, ids.student])).rows, applicationBefore)
        const next = await saveSession(uuid(101022), ids.userA, ids.grading, ids.student, 'assessment', first.value, { status: 'pending', notes: 'Newer pending notes' })
        assert.deepEqual(await saveSession(uuid(101021), ids.userA, ids.grading, ids.student, 'assessment', expected, { status: 'completed', notes: 'Recorded completed notes' }), first)
        await expectedFailure('PRS01', () => saveSession(uuid(101023), ids.userA, ids.grading, ids.student, 'assessment', first.value, { status: 'completed', notes: 'Stale notes' }))
        const cleared = await saveSession(uuid(101024), ids.userA, ids.grading, ids.student, 'assessment', next.value, { status: null, notes: null })
        assert.deepEqual(cleared.value, { status: null, notes: null })
        await expectedFailure('42501', () => sql("update public.event_students set assessment_status='completed' where event_id=$1 and student_id=$2", [ids.grading, ids.student]))
      })
    })

    await suite.test('session saves enforce actor role/link/account, event type and candidate association while supporting date-only grading', async () => {
      const expected = { status: null, notes: null }
      const value = { status: 'pending', notes: 'Stored pending notes' }
      for (const user of [ids.userB, ids.userStudent, ids.unlinked, ids.admin]) {
        await assert.rejects(asAccount(user, () => saveSession(uuid(101031), user, ids.unrecordedGrading, ids.student, 'assessment', expected, value)), { code: '42501' })
      }
      await assert.rejects(asAccount(ids.userA, () => saveSession(uuid(101032), ids.userB, ids.unrecordedGrading, ids.student, 'assessment', expected, value)), { code: '42501' })
      await assert.rejects(asAccount(ids.userA, () => saveSession(uuid(101033), ids.userA, ids.unrecordedGrading, ids.peer, 'assessment', expected, value)), { code: '42501' })
      await assert.rejects(asAccount(ids.userA, () => saveSession(uuid(101034), ids.userA, ids.ownFuture, ids.student, 'assessment', expected, value)), { code: '22023' })
      await assert.rejects(asAccount(null, () => saveSession(uuid(101035), ids.userA, ids.unrecordedGrading, ids.student, 'assessment', expected, value), 'anon'), { code: '42501' })
      await asAccount(ids.userA, async () => {
        const event = uuid(7000)
        const current = (await sql('select assessment_status,assessment_notes from public.event_students where event_id=$1 and student_id=$2', [event, ids.student])).rows[0]
        await saveSession(uuid(101036), ids.userA, event, ids.student, 'assessment', { status: current.assessment_status, notes: current.assessment_notes }, value)
        assert.equal((await sql('select starts_at from public.events where id=$1', [event])).rows[0].starts_at, null)
      })
      await sql("update public.events set status='cancelled' where id=$1", [ids.unrecordedGrading])
      await assert.rejects(asAccount(ids.userA, () => saveSession(uuid(101037), ids.userA, ids.unrecordedGrading, ids.student, 'assessment', expected, value)), { code: 'PRS03' })
    })

    await suite.test('committed report saves appear in history/report reads and private receipts still require current role and ownership', async () => {
      const expected = { report: null, reportAuthorId: null }
      const value = { report: 'Committed report after reload' }
      await sql("update public.events set status='completed' where id=$1", [ids.ownPast])
      await db.exec('begin; set local role authenticated')
      let saved
      try {
        await sql("select set_config('request.jwt.claim.sub',$1,true)", [ids.userA])
        saved = await saveSession(uuid(101050), ids.userA, ids.ownPast, ids.peer, 'report', expected, value)
        await db.exec('commit')
      } catch (error) { await db.exec('rollback'); throw error }
      await asAccount(ids.userA, async () => {
        const history = await rpc('instructor_student_history', [ids.peer])
        assert.equal(history.items.find(item => item.event.id === ids.ownPast).record.report, value.report)
        const reports = await rpc('instructor_event_reports', [ids.ownPast])
        assert.equal(reports.items.find(item => item.record.student_id === ids.peer).reportAuthor.id, ids.instructorA)
        await expectedFailure('42501', () => sql('select * from public.instructor_session_write_requests'))
      })
      await sql("update public.users set role='student' where id=$1", [ids.userA])
      try {
        await assert.rejects(asAccount(ids.userA, () => saveSession(uuid(101050), ids.userA, ids.ownPast, ids.peer, 'report', expected, value)), { code: '42501' })
      } finally { await sql("update public.users set role='instructor' where id=$1", [ids.userA]) }
      await sql("update public.events set status='cancelled' where id=$1", [ids.ownPast])
      assert.deepEqual(await asAccount(ids.userA, () => saveSession(uuid(101050), ids.userA, ids.ownPast, ids.peer, 'report', expected, value)), saved)
      await assert.rejects(asAccount(ids.userA, () => saveSession(uuid(101051), ids.userA, ids.ownPast, ids.peer, 'report', saved.value, { report: 'Cancelled edit' })), { code: 'PRS03' })
      await assert.rejects(asAccount(ids.userB, () => saveSession(uuid(101050), ids.userB, ids.ownPast, ids.peer, 'report', expected, value)), { code: '42501' })
    })
    await suite.test('report removal preserves all roster/assessment data and leaves history, attendance and assessment writes working', async () => {
      const preserved = (await sql("select to_jsonb(es) - 'report' - 'report_author_id' as record from public.event_students es order by event_id, student_id")).rows
      const signOffs = (await sql('select * from public.technique_sign_offs order by id')).rows
      await db.exec(await readFile(new URL('../supabase/migrations/20261107031006_remove_instructor_reports.sql', import.meta.url), 'utf8'))
      assert.deepEqual((await sql('select to_jsonb(es) as record from public.event_students es order by event_id, student_id')).rows, preserved)
      assert.deepEqual((await sql('select * from public.technique_sign_offs order by id')).rows, signOffs)
      assert.deepEqual((await sql("select column_name from information_schema.columns where table_schema='public' and table_name='event_students' and column_name in ('report','report_author_id')")).rows, [])
      assert.equal((await sql("select to_regprocedure('public.instructor_event_reports(uuid,integer,integer)') as retired")).rows[0].retired, null)
      await asAccount(ids.userA, async () => {
        const history = decoders.decodePage(await rpc('instructor_student_history', [ids.student, 20, 0, 'class', null, false, false, false]), decoders.decodeHistoryEntry)
        assert.ok(history.items.length > 0)
        assert.equal('report' in history.items[0].record, false)
        assert.equal('reportAuthor' in history.items[0], false)
        decoders.decodeSummary(await rpc('instructor_student_summary', [ids.student]))
        const row = (await sql('select * from public.event_students where event_id=$1 and student_id=$2', [ids.grading, ids.student])).rows[0]
        const expected = { status: row.assessment_status, notes: row.assessment_notes }
        const result = await saveSession(uuid(102001), ids.userA, ids.grading, ids.student, 'assessment', expected, { status: 'completed', notes: 'Assessment without reports' })
        decoders.decodeSessionSave(result)
        assert.equal(result.value.notes, 'Assessment without reports')
        assert.deepEqual(await saveSession(uuid(102001), ids.userA, ids.grading, ids.student, 'assessment', expected, result.value), result)
        await expectedFailure('42501', () => sql("update public.event_students set assessment_notes='Direct write' where event_id=$1 and student_id=$2", [ids.grading, ids.student]))
        await expectedFailure('22023', () => saveSession(uuid(102002), ids.userA, ids.grading, ids.student, 'report', {}, {}))
      })
      await sql("update public.events set status='scheduled',starts_at=now()+interval '1 hour',ends_at=now()+interval '2 hours' where id=$1", [ids.ownFuture])
      await asAccount(ids.userA, async () => {
        const expected = await snapshot(ids.ownFuture, ids.peer)
        const saved = await saveAttendance(uuid(102003), ids.userA, ids.ownFuture, 'student', 'absent', expected)
        assert.equal(saved.attendance[0].status, 'absent')
      })
    })
  } finally {
    await db.close()
  }
})
