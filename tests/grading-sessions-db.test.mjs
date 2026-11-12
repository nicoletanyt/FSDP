import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [a, b, c, studentUser, admin] = [1, 2, 3, 4, 5].map(uuid)
const [ia, ib, ic, centre, student, event, otherEvent, walkIn, third] = [11, 12, 13, 20, 31, 100, 102, 33, 34].map(uuid)
const migration = name => new URL(`../supabase/migrations/${name}.sql`, import.meta.url)

test('grading sessions (offline PostgreSQL)', async suite => {
  const db = new PGlite()
  const sql = (text, args = []) => db.query(text, args)
  async function as(user, run) {
    await db.exec('begin; set local role authenticated;')
    try {
      await sql("select set_config('request.jwt.claim.sub',$1,true)", [user])
      const result = await run()
      await db.exec('commit')
      return result
    } catch (error) { await db.exec('rollback'); throw error }
  }
  let sequence = 500
  const rpc = (user, call, args) => as(user, async () => (await sql(`select ${call} as data`, args)).rows[0].data)
  const sort = (user, target = otherEvent) => rpc(user, 'public.sort_grading_sessions($1)', [target])
  const move = (user, application, session) => rpc(user, 'public.move_grading_candidate($1,$2)', [application, session])
  const save = (user, session, version, cells, comments = null) => comments
    ? rpc(user, 'public.save_instructor_grading_batch_with_comments($1,$2,$3,$4,$5,$6,false,null)',
      [uuid(sequence++), user, session, version, JSON.stringify(cells), JSON.stringify(comments)])
    : rpc(user, 'public.save_instructor_grading_batch($1,$2,$3,$4,$5,false,null)',
      [uuid(sequence++), user, session, version, JSON.stringify(cells)])
  const application = async (studentId, target = otherEvent) => (await sql(
    'select id from public.grading_applications where student_id=$1 and grading_event_id=$2', [studentId, target])).rows[0].id

  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}',raw_app_meta_data jsonb not null default '{}',created_at timestamptz not null default now());
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to anon,authenticated,service_role;
      alter default privileges in schema public grant all on tables to anon,authenticated;
    `)
    for (const name of ['20261026120000_auth_roles', '20261026130000_sync_trusted_roles', '20261030120000_copilot_records', '20261030130000_gpt_names',
      '20261102041227_reset_and_domain_schema', '20261104120000_instructor_reads', '20261105130000_instructor_all_students', '20261105140000_instructor_grading_reads']) {
      await db.exec(await readFile(migration(name), 'utf8'))
    }
    await db.exec((await readFile(migration('20261104055444_official_grading_schedule'), 'utf8')).split('-- Keep the send history')[0])
    for (const [id, role] of [[a, 'instructor'], [b, 'instructor'], [c, 'instructor'], [studentUser, 'student'], [admin, 'administrator']]) {
      await sql('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)', [id, `${id}@example.test`, JSON.stringify({ role })])
    }
    await db.exec(`
      insert into public.centres(id,name,short_name) values('${centre}','Test','test');
      insert into public.grades values('unranked','Unranked',null,false,0),('target','Target','Blue',true,1);
      insert into public.grade_tracks values('target','adult');
      insert into public.syllabus_items(id,grade_id,track,category,sort_order,label) values('one','target','adult','Basics',1,'One'),('two','target','adult','Basics',2,'Two');
      insert into public.instructors(id,user_id,first_name,last_name,email) values
        ('${ia}','${a}','A','Instructor','a@example.test'),('${ib}','${b}','B','Instructor','b@example.test'),('${ic}','${c}','C','Instructor','c@example.test');
      insert into public.students(id,user_id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,joined_at) values
        ('${student}','${studentUser}','001','First','Student','s@example.test','${centre}','2000-01-01','2020-01-01'),
        ('${walkIn}',null,'003','Walk','In','w@example.test','${centre}','2000-01-01','2020-01-01');
      insert into public.events(id,event_type,centre_id,instructor_id,name,starts_at,ends_at) values
        ('${event}','grading','${centre}','${ia}','Grading',now(),now()+interval '1 hour'),
        ('${otherEvent}','grading','${centre}',null,'Other grading',now(),now()+interval '1 hour');
      insert into public.gradings(event_id) values('${event}'),('${otherEvent}');
      insert into public.event_students(event_id,student_id) values('${event}','${student}'),('${event}','${walkIn}');
      insert into public.grading_target_grades(grading_event_id,grade_id) values('${event}','target');
    `)
    for (const name of ['20261108152249_instructor_grading_batches', '20261108154345_resume_editable_grading_batches',
      '20261110120000_grading_batch_comments', '20261108161141_instructor_grades', '20261111100917_instructor_titles',
      '20261111120948_required_instructor_title']) {
      await db.exec(await readFile(migration(name), 'utf8'))
    }
    // The pre-existing roster snapshot covered everyone; B's legacy draft uses both students.
    await sql("insert into public.grading_applications(student_id,grading_event_id,target_grade_id) values($1,$2,'target')", [student, event])
    const legacyCells = [student, walkIn].flatMap(student_id => ['one', 'two'].map(syllabus_item_id => ({ student_id, syllabus_item_id, checked: true })))
    // B starts a draft before panels exist; the backfill must keep it editable.
    const draft = await as(b, async () => (await sql(
      "select public.save_instructor_grading_batch($1,$2,$3,'adult','target',0,$4,false,null) as data",
      [uuid(sequence++), b, event, JSON.stringify(legacyCells)])).rows[0].data)
    await db.exec(await readFile(migration('20261111123748_grading_panels'), 'utf8'))
    await db.exec(await readFile(migration('20261111131029_examiner_grading_list'), 'utf8'))
    await db.exec(await readFile(migration('20261111135426_grading_grade_sessions'), 'utf8'))
    await db.exec(await readFile(migration('20261111143128_grade_session_times'), 'utf8'))
    await db.exec(await readFile(migration('20261111143913_grading_day_current_grade'), 'utf8'))

    // Before this migration, the target grade on the first grading had its own time.
    await sql("update public.grading_target_grades set starts_at='2026-11-14T02:00:00Z', ends_at='2026-11-14T02:30:00Z' where grading_event_id=$1", [event])
    // The second grading: two target grades, three applicants, applications closed yesterday.
    await db.exec(`
      insert into public.grades values('second','Second','Brown',true,2);
      insert into public.grade_tracks values('second','adult');
      insert into public.syllabus_items(id,grade_id,track,category,sort_order,label) values('three','second','adult','Kihon',1,'Three');
      insert into public.students(id,user_id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,joined_at) values
        ('${third}',null,'004','Third','Person','t@example.test','${centre}','2000-01-01','2020-01-01');
      update public.gradings set track='adult', application_deadline=(now() at time zone 'Asia/Singapore')::date - 1 where event_id='${otherEvent}';
      update public.events set starts_at='2026-11-21T02:00:00Z', ends_at='2026-11-21T03:00:00Z' where id='${otherEvent}';
      insert into public.grading_target_grades(grading_event_id,grade_id) values('${otherEvent}','target'),('${otherEvent}','second');
      insert into public.grading_applications(student_id,grading_event_id,target_grade_id) values
        ('${student}','${otherEvent}','target'),('${walkIn}','${otherEvent}','target'),('${third}','${otherEvent}','second');
    `)
    await as(admin, () => sql('select public.set_grading_panel($1,$2::uuid[],$3)', [otherEvent, [ia], ia]))
    // Live-only tables (from migrations outside this branch) that mark grading as started.
    await db.exec(`
      create table if not exists public.instructor_grading_reviews(id uuid primary key default gen_random_uuid(), event_id uuid not null);
      alter table public.technique_sign_offs add column if not exists event_id uuid;
    `)
    await db.exec(await readFile(migration('20261112021925_grading_sessions'), 'utf8'))

    await suite.test('backfill turns each timed grade into a session and moves batches onto it', async () => {
      const sessions = (await sql('select id, position, starts_at from public.grading_sessions where grading_event_id=$1', [event])).rows
      assert.equal(sessions.length, 1)
      assert.equal(sessions[0].position, 1)
      assert.equal(sessions[0].starts_at.toISOString(), '2026-11-14T02:00:00.000Z')
      assert.equal((await sql('select session_id from public.grading_applications where grading_event_id=$1', [event])).rows[0].session_id, sessions[0].id)
      const batch = (await sql('select session_id from public.grading_batches where event_id=$1', [event])).rows[0]
      assert.equal(batch.session_id, sessions[0].id)
      assert.deepEqual((await sql("select distinct target_grade_id from public.grading_batch_students")).rows, [{ target_grade_id: 'target' }])
      assert.deepEqual((await sql("select distinct grade_id from public.grading_batch_items")).rows, [{ grade_id: 'target' }])
      assert.equal((await sql("select count(*)::int as n from information_schema.columns where table_name='grading_target_grades' and column_name='starts_at'")).rows[0].n, 0)
    })

    await suite.test('before sorting, every applicant is listed and there are no sessions', async () => {
      const day = await rpc(admin, 'public.examiner_grading_day($1)', [otherEvent])
      assert.deepEqual(day.sessions, [])
      assert.equal(day.grading_started, false)
      assert.ok(day.application_deadline)
      assert.deepEqual(day.students.map(row => [row.name, row.target_grade.id, row.candidate_number, row.session_id]).sort(),
        [['First Student', 'target', null, null], ['Third Person', 'second', null, null], ['Walk In', 'target', null, null]])
    })

    await suite.test('only administrators sort, and only after applications close', async () => {
      await assert.rejects(sort(a), error => error.code === '42501')
      await sql("update public.gradings set application_deadline=(now() at time zone 'Asia/Singapore')::date where event_id=$1", [otherEvent])
      await assert.rejects(sort(admin), error => error.code === 'PGS01')
      await sql("update public.gradings set application_deadline=(now() at time zone 'Asia/Singapore')::date - 1 where event_id=$1", [otherEvent])
    })

    await suite.test('sorting makes one 30-minute session per grade and numbers the roster in session order', async () => {
      const day = await sort(admin)
      assert.deepEqual(day.sessions.map(row => [row.position, new Date(row.starts_at).toISOString().slice(11, 16), new Date(row.ends_at).toISOString().slice(11, 16), row.grades.map(grade => grade.grade.id)]),
        [[1, '02:00', '02:30', ['target']], [2, '02:30', '03:00', ['second']]])
      assert.deepEqual(day.students.map(row => [row.candidate_number, row.name]), [[1, 'Walk In'], [2, 'First Student'], [3, 'Third Person']])
      assert.equal((await sql('select ends_at from public.events where id=$1', [otherEvent])).rows[0].ends_at.toISOString(), '2026-11-21T03:00:00.000Z')
      // Sorting again gives the same result.
      const again = await sort(admin)
      assert.deepEqual(again.students.map(row => row.candidate_number), [1, 2, 3])
      assert.equal(again.sessions.length, 2)
    })

    await suite.test('moving a candidate merges grades into one session and removes the emptied one', async () => {
      await assert.rejects(move(a, await application(third), uuid(999)), error => error.code === '42501')
      const before = await rpc(admin, 'public.examiner_grading_day($1)', [otherEvent])
      await assert.rejects(move(admin, await application(third), (await sql('select id from public.grading_sessions where grading_event_id=$1', [event])).rows[0].id),
        error => error.code === '22023')
      const day = await move(admin, await application(third), before.sessions[0].id)
      assert.equal(day.sessions.length, 1)
      assert.deepEqual(day.sessions[0].grades.map(grade => [grade.grade.id, grade.candidates.length]), [['target', 2], ['second', 1]])
      assert.equal(day.students.find(row => row.name === 'Third Person').candidate_number, 3)
    })

    await suite.test('a session checklist grades each candidate on their own grade only, then locks the sessions', async () => {
      const [session] = (await rpc(admin, 'public.examiner_grading_day($1)', [otherEvent])).sessions
      const right = [student, walkIn].flatMap(student_id => ['one', 'two'].map(syllabus_item_id => ({ student_id, syllabus_item_id, checked: true })))
        .concat({ student_id: third, syllabus_item_id: 'three', checked: false })
      await assert.rejects(save(a, session.id, 0, right.map(cell => cell.student_id === third ? { ...cell, syllabus_item_id: 'one' } : cell)),
        error => error.code === 'PGB01')
      const comments = [student, walkIn, third].map(student_id => ({ student_id, notes: student_id === third ? 'Late' : null }))
      const saved = await save(a, session.id, 0, right, comments)
      assert.equal(saved.version, 1)
      assert.equal(saved.session_id, session.id)
      assert.deepEqual(saved.students.map(row => [row.candidate_number, row.target_grade_id, row.notes]), [[1, 'target', null], [2, 'target', null], [3, 'second', 'Late']])
      assert.deepEqual(saved.items.map(row => [row.grade_id, row.syllabus_item_id]), [['target', 'one'], ['target', 'two'], ['second', 'three']])
      assert.deepEqual(await rpc(a, 'public.get_instructor_grading_batch($1)', [session.id]), saved)
      const day = await rpc(a, 'public.examiner_grading_day($1)', [otherEvent])
      assert.equal(day.grading_started, true)
      assert.equal(day.sessions[0].my_batch.status, 'draft')
      await assert.rejects(sort(admin), error => error.code === 'PGS02')
      await assert.rejects(move(admin, await application(third), session.id), error => error.code === 'PGS02')
    })

    await suite.test('the calendar lists each session with its grades and candidates', async () => {
      const calendar = await rpc(a, "public.instructor_calendar('2026-11-20T00:00:00Z','2026-11-23T00:00:00Z')", [])
      const grading = calendar.items.find(item => item.id === otherEvent).grading
      assert.deepEqual(grading.sessions.map(row => [row.position, row.candidates, row.grades.map(grade => grade.id)]), [[1, 3, ['target', 'second']]])
      assert.ok(grading.target_grades.every(row => !('starts_at' in row)))
    })
  } finally {
    await db.close()
  }
})
