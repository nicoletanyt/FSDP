import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { decoders } from './helpers/instructor-modules.mjs'

const uuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const ids = {
  admin: uuid(1), userA: uuid(2), userB: uuid(3), userStudent: uuid(4), unlinked: uuid(5),
  instructorA: uuid(11), instructorB: uuid(12), centreA: uuid(21), centreB: uuid(22),
  student: uuid(31), peer: uuid(32), unrelated: uuid(33),
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
        ('${ids.unrelated}',null,'HIDDEN','Hidden','Student','hidden@example.test','${ids.centreB}','2000-01-01','unranked','2020-01-01',null);
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

    await suite.test('directory preserves authorized totals, facets, literal search and stable tie ordering', async () => {
      await asAccount(ids.userA, async () => {
        const first = await rpc('instructor_student_directory', ['', null, null, null, 1, 0], ['text', 'text', 'text', 'uuid', 'int', 'int'])
        assert.equal(decoders.decodeDirectory(first).items[0].student.id, ids.student)
        const second = await rpc('instructor_student_directory', ['', null, null, null, 1, 1], ['text', 'text', 'text', 'uuid', 'int', 'int'])
        assert.equal(first.total, 2)
        assert.equal(first.scopeTotal, 2)
        assert.deepEqual([first.items[0].id, second.items[0].id], [ids.student, ids.peer])
        assert.equal(first.facets.grades.length, 2)
        assert.equal(first.facets.centres.length, 2)
        assert.deepEqual(first.facets.colours, ['Blue'])
        const literal = await rpc('instructor_student_directory', ['%_'])
        assert.deepEqual(literal.items.map(item => item.id), [ids.peer])
        const filtered = await rpc('instructor_student_directory', ['', 'published-blue', 'Blue', ids.centreA])
        assert.equal(filtered.total, 1)
        assert.equal(filtered.scopeTotal, 2)
        assert.equal(filtered.facets.grades.length, 2)
        const beyond = await rpc('instructor_student_directory', ['', null, null, null, 10, 100], ['text', 'text', 'text', 'uuid', 'int', 'int'])
        assert.equal(beyond.total, 2)
        assert.deepEqual(beyond.items, [])
        assert.equal((await rpc('instructor_student_directory', ['HIDDEN'])).total, 0)
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
        const hidden = await sql('select * from public.event_students where student_id=$1', [ids.unrelated])
        assert.equal(hidden.rows.length, 0)
      })
      await assert.rejects(asAccount(ids.userA, () => rpc('instructor_student_history', [ids.unrelated])), { code: '42501' })
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
      decoders.decodePage(reports, decoders.decodeSessionReport)
      assert.equal(reports.total, 2)
      assert.equal(reports.items[0].record.report_author_id, ids.instructorB)
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
        const result = await sql("update public.event_students set attendance_status='late' where event_id=$1 and student_id=$2 returning report", [ids.ownFuture, ids.student])
        assert.equal(result.rows[0].report, 'Report by second instructor')
        await sql("update public.event_students set report='Own report',report_author_id=$3 where event_id=$1 and student_id=$2", [ids.ownFuture, ids.peer, ids.instructorA])
        const own = await sql("update public.event_students set report='Own edit' where event_id=$1 and student_id=$2 returning report", [ids.ownFuture, ids.peer])
        assert.equal(own.rows[0].report, 'Own edit')
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

    await suite.test('anonymous, student and unlinked accounts cannot call instructor read RPCs', async () => {
      for (const [name, parameters] of [
        ['instructor_student_directory', []], ['instructor_student_history', [ids.student]],
        ['instructor_student_summary', [ids.student]], ['instructor_event_reports', [ids.ownFuture]],
      ]) {
        for (const account of [ids.userStudent, ids.unlinked, ids.admin]) {
          await assert.rejects(asAccount(account, () => rpc(name, parameters)), { code: '42501' })
        }
        await assert.rejects(asAccount(null, () => rpc(name, parameters), 'anon'), { code: '42501' })
      }
      const own = await asAccount(ids.userStudent, () => sql('select distinct student_id from public.event_students'))
      assert.deepEqual(own.rows.map(row => row.student_id), [ids.student])
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
      await assert.rejects(asAccount(ids.userA, () => sql("insert into public.grade_requirements(grade_id,track) values ('unranked','children')")), { code: '42501' })
      await asAccount(ids.admin, () => sql("insert into public.grade_requirements(grade_id,track) values ('unranked','children')"))
    })
  } finally {
    await db.close()
  }
})
