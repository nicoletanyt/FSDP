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
      create or replace function public.eligible_grading_students(target_event uuid)
      returns table(student_id uuid, user_id uuid, email text, target_grade_id text)
      language sql stable as $$ select null::uuid, null::uuid, null::text, null::text where false $$;
    `)
    await db.exec(await readFile(migration('20261112021925_grading_sessions'), 'utf8'))
    await db.exec(await readFile(migration('20261112150000_grading_scheduler'), 'utf8'))
    // The first tests keep one short session per grade: nothing is small enough to merge.
    await sql("update public.grading_schedule_rules set min_session_size=1, default_session_minutes=30, changeover_minutes=0, day_start='10:00' where track='adult'")

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

    await suite.test('sorting makes one session per transition and numbers the roster in session order', async () => {
      const day = await sort(admin)
      assert.deepEqual(day.sessions.map(row => [row.position, new Date(row.starts_at).toISOString().slice(11, 16), new Date(row.ends_at).toISOString().slice(11, 16), row.grades.map(grade => grade.grade.id)]),
        [[1, '02:00', '02:30', ['target']], [2, '02:30', '03:00', ['second']]])
      assert.deepEqual(day.students.map(row => [row.candidate_number, row.name]), [[1, 'Walk In'], [2, 'First Student'], [3, 'Third Person']])
      assert.equal(day.published_at, null)
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
      const draftCells = [student, walkIn].flatMap(student_id => ['one', 'two'].map(syllabus_item_id => ({ student_id, syllabus_item_id, checked: true })))
        .concat({ student_id: third, syllabus_item_id: 'three', checked: false })
      await assert.rejects(save(a, session.id, 0, draftCells), error => error.code === 'PGB04')
      const published = await rpc(admin, 'public.publish_grading_schedule($1)', [otherEvent])
      assert.ok(published.published_at)
      assert.equal((await sql('select ends_at from public.events where id=$1', [otherEvent])).rows[0].ends_at.toISOString(), '2026-11-21T02:30:00.000Z')
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

    // ---- Rule-driven scheduler -------------------------------------------
    const [venue, day1, day2] = [21, 110, 111].map(uuid)
    const sgt = iso => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' })
    const shape = day => day.sessions.map(row => [row.position, sgt(row.starts_at), sgt(row.ends_at),
      row.transitions.map(t => `${t.from.id}>${t.to.id}:${t.candidates}`).join(' ')])
    const addGroup = (prefix, count, current, target, events) => db.exec(`
      insert into public.students(id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,joined_at,current_grade_id)
        select gen_random_uuid(), '${prefix}' || n, 'S', '${prefix}' || lpad(n::text, 3, '0'), '${prefix}' || n || '@example.test',
          '${centre}', '2000-01-01', '2020-01-01', '${current}' from generate_series(1, ${count}) n;
      insert into public.grading_applications(student_id,grading_event_id,target_grade_id)
        select s.id, e.id, '${target}' from public.students s cross join (values ${events.map(id => `('${id}'::uuid)`).join(',')}) e(id)
        where s.member_no like '${prefix}%';
    `)

    await suite.test('scheduler setup', async () => {
      await db.exec(`
        update public.grading_schedule_rules set min_session_size=6, default_session_minutes=60, changeover_minutes=15,
          day_start='09:00', day_end='21:00', lunch_start='12:00', lunch_end='13:00' where track='adult';
        insert into public.grades values('a1','A1',null,true,11),('a2','A2',null,true,12),('a3','A3',null,true,13),('a4','A4',null,true,14),('a5','A5',null,true,15);
        insert into public.grade_tracks values('a1','adult'),('a2','adult'),('a3','adult'),('a4','adult'),('a5','adult');
        insert into public.grading_session_durations(track,from_grade_id,to_grade_id,minutes) values
          ('adult',null,'a1',75),('adult',null,'a2',75),('adult',null,'a3',90),('adult',null,'a4',90),('adult',null,'a5',75);
        insert into public.centres(id,name,short_name,capacity) values('${venue}','Venue','venue',30);
        insert into public.events(id,event_type,centre_id,name,starts_at,ends_at) values
          ('${day1}','grading','${venue}','Day one','2026-12-05T01:00:00Z','2026-12-05T02:00:00Z'),
          ('${day2}','grading','${centre}','Day two','2026-12-12T01:00:00Z','2026-12-12T02:00:00Z');
        insert into public.gradings(event_id,track,grading_date,application_deadline) values
          ('${day1}','adult','2026-12-05',(now() at time zone 'Asia/Singapore')::date - 1),
          ('${day2}','adult','2026-12-12',(now() at time zone 'Asia/Singapore')::date - 1);
        insert into public.grading_target_grades(grading_event_id,grade_id)
          select e.id, g.id from (values ('${day1}'::uuid),('${day2}'::uuid)) e(id) cross join (values ('a1'),('a2'),('a3'),('a4'),('a5')) g(id);
      `)
      await addGroup('g1-', 50, 'second', 'a1', [day1])
      await addGroup('g1b-', 29, 'second', 'a1', [day2])
      await addGroup('g2-', 6, 'a1', 'a2', [day1])
      await addGroup('g2b-', 2, 'a1', 'a2', [day2])
      await addGroup('g3-', 2, 'a2', 'a3', [day1])
      await addGroup('g4-', 2, 'a3', 'a4', [day1])
      await addGroup('g5-', 2, 'a4', 'a5', [day1, day2])
      await addGroup('gw-', 1, 'a1', 'a2', [day1])
      await sql("update public.grading_applications ga set status='withdrawn' from public.students s where s.id=ga.student_id and s.member_no like 'gw-%'")
      await as(admin, () => sql('select public.set_grading_panel($1,$2::uuid[],$3)', [day1, [ia, ib], ia]))
    })

    await suite.test('groups by transition, splits evenly, merges only small neighbours of equal length, then places the day', async () => {
      const day = await sort(admin, day1)
      assert.deepEqual(shape(day), [
        [1, '09:00', '10:15', 'second>a1:25'],
        [2, '10:30', '11:45', 'second>a1:25'],
        // Would end after 12:00, so it waits for lunch to finish. Not small, so not merged.
        [3, '13:00', '14:15', 'a1>a2:6'],
        // Two small neighbouring 90-minute groups share a session.
        [4, '14:30', '16:00', 'a2>a3:2 a3>a4:2'],
        // Small, but its neighbour's sessions are 90 minutes long.
        [5, '16:15', '17:30', 'a4>a5:2'],
      ])
      assert.equal(day.students.length, 62, 'the withdrawn applicant is left out')
      assert.equal(day.capacity, 30)
      assert.deepEqual(day.warnings, [])
      assert.equal(day.published_at, null)
      assert.deepEqual(day.students.map(row => row.candidate_number).sort((x, y) => x - y), Array.from({ length: 62 }, (_, i) => i + 1))
    })

    await suite.test('capacity and ladder gaps stop merges; a missing venue capacity is a warning', async () => {
      const day = await sort(admin, day2)
      assert.deepEqual(shape(day).map(row => row[3]), ['second>a1:29', 'a1>a2:2', 'a4>a5:2'])
      assert.deepEqual(day.warnings.map(row => row.code), ['default_capacity'])
    })

    await suite.test('running past the day end is a warning and nobody is dropped', async () => {
      await sql("update public.grading_schedule_rules set day_end='15:00' where track='adult'")
      const day = await rpc(admin, 'public.examiner_grading_day($1)', [day1])
      assert.equal(day.warnings[0].code, 'overflow')
      assert.deepEqual(day.warnings[0].session_ids, day.sessions.slice(3).map(row => row.id))
      assert.match(day.warnings[0].message, /^2 sessions with 6 candidates run past 3:00 pm/)
      assert.equal(day.students.filter(row => row.session_id).length, 62)
      await sql("update public.grading_schedule_rules set day_end='21:00' where track='adult'")
    })

    await suite.test('the chief examiner sees the draft read-only; other examiners see it once published', async () => {
      const chief = await rpc(a, 'public.examiner_grading_day($1)', [day1])
      assert.equal(chief.sessions.length, 5)
      assert.equal(chief.warnings.length, 0)
      const other = await rpc(b, 'public.examiner_grading_day($1)', [day1])
      assert.deepEqual(other.sessions, [])
      assert.ok(other.students.every(row => row.session_id === null))
      assert.equal((await as(b, () => sql('select count(*)::int as n from public.grading_sessions where grading_event_id=$1', [day1]))).rows[0].n, 0)
      await assert.rejects(rpc(a, 'public.publish_grading_schedule($1)', [day1]), error => error.code === '42501')
      await assert.rejects(rpc(a, 'public.split_grading_session($1,$2::uuid[])', [chief.sessions[2].id, []]), error => error.code === '42501')
      await assert.rejects(rpc(a, 'public.merge_grading_sessions($1,$2)', [chief.sessions[0].id, chief.sessions[1].id]), error => error.code === '42501')
      await assert.rejects(sort(a, day1), error => error.code === '42501')

      const published = await rpc(admin, 'public.publish_grading_schedule($1)', [day1])
      assert.ok(published.published_at)
      assert.equal(sgt((await sql('select starts_at from public.events where id=$1', [day1])).rows[0].starts_at), '09:00')
      assert.equal(sgt((await sql('select ends_at from public.events where id=$1', [day1])).rows[0].ends_at), '17:30')
      assert.equal((await rpc(b, 'public.examiner_grading_day($1)', [day1])).sessions.length, 5)
    })

    await suite.test('splitting and merging re-time the day and return it to draft', async () => {
      const before = await rpc(admin, 'public.examiner_grading_day($1)', [day1])
      const third = before.sessions[2]
      const moving = third.grades[0].candidates.slice(0, 3).map(row => row.application_id)
      await assert.rejects(rpc(admin, 'public.split_grading_session($1,$2::uuid[])', [third.id, third.grades[0].candidates.map(row => row.application_id)]),
        error => error.code === '22023')
      const split = await rpc(admin, 'public.split_grading_session($1,$2::uuid[])', [third.id, moving])
      assert.equal(split.published_at, null)
      assert.deepEqual(shape(split).slice(2), [
        [3, '13:00', '14:15', 'a1>a2:3'], [4, '14:30', '15:45', 'a1>a2:3'],
        [5, '16:00', '17:30', 'a2>a3:2 a3>a4:2'], [6, '17:45', '19:00', 'a4>a5:2'],
      ])
      assert.deepEqual((await rpc(b, 'public.examiner_grading_day($1)', [day1])).sessions, [])
      const merged = await rpc(admin, 'public.merge_grading_sessions($1,$2)', [split.sessions[3].id, split.sessions[2].id])
      assert.deepEqual(shape(merged), shape(before))
      // A 90-minute group moved into a 75-minute session lengthens it and is flagged.
      const mixed = await move(admin, merged.sessions[3].grades[0].candidates[0].application_id, merged.sessions[4].id)
      assert.deepEqual(mixed.sessions[4].starts_at && [sgt(mixed.sessions[4].starts_at), sgt(mixed.sessions[4].ends_at)], ['16:15', '17:45'])
      assert.deepEqual(mixed.warnings.map(row => row.code), ['mixed_lengths'])
    })

    await suite.test('private gradings are scheduled by hand and cannot be published with gaps', async () => {
      await sql('update public.gradings set is_private=true where event_id=$1', [day2])
      await sql('delete from public.grading_sessions where grading_event_id=$1', [day2])
      await sql('delete from public.event_students where event_id=$1', [day2])
      await assert.rejects(sort(admin, day2), error => error.code === 'PGS01' && /Private/.test(error.message))
      // The first session takes every unplaced applicant, numbered onto the roster.
      const added = await rpc(admin, 'public.add_grading_session($1)', [day2])
      assert.deepEqual(shape(added), [[1, '09:00', '10:15', 'second>a1:29 a1>a2:2 a4>a5:2']])
      assert.deepEqual(added.students.map(row => row.candidate_number).sort((x, y) => x - y), Array.from({ length: 33 }, (_, i) => i + 1))
      assert.deepEqual(added.warnings.map(row => row.code), ['over_capacity', 'default_capacity'])
      const empty = await rpc(admin, 'public.add_grading_session($1)', [day2])
      assert.deepEqual(shape(empty)[1], [2, '10:30', '11:30', ''])
      assert.deepEqual(empty.warnings.map(row => row.code), ['over_capacity', 'empty_session', 'default_capacity'])
      await assert.rejects(rpc(admin, 'public.publish_grading_schedule($1)', [day2]), error => error.code === 'PGS01' && /empty/.test(error.message))
      const placed = await move(admin, added.sessions[0].grades.at(-1).candidates[0].application_id, empty.sessions[1].id)
      assert.equal(sgt(placed.sessions[1].ends_at), '11:45')
      assert.ok((await rpc(admin, 'public.publish_grading_schedule($1)', [day2])).published_at)
    })

    await suite.test('only administrators read or change the scheduling rules', async () => {
      assert.equal((await as(a, () => sql('select count(*)::int as n from public.grading_schedule_rules'))).rows[0].n, 0)
      assert.equal((await as(a, () => sql('select count(*)::int as n from public.grading_session_durations'))).rows[0].n, 0)
      await as(a, () => sql("update public.grading_schedule_rules set min_session_size=1"))
      assert.equal((await sql("select min_session_size from public.grading_schedule_rules where track='adult'")).rows[0].min_session_size, 6)
      assert.equal((await as(admin, () => sql('select count(*)::int as n from public.grading_schedule_rules'))).rows[0].n, 2)
      await as(admin, () => sql("update public.grading_schedule_rules set changeover_minutes=10 where track='children'"))
      assert.equal((await sql("select changeover_minutes from public.grading_schedule_rules where track='children'")).rows[0].changeover_minutes, 10)
    })
  } finally {
    await db.close()
  }
})
