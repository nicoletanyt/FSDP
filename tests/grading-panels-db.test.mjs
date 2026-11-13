import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const [a, b, c, studentUser, admin] = [1, 2, 3, 4, 5].map(uuid)
const [ia, ib, ic, centre, student, event, otherEvent, walkIn] = [11, 12, 13, 20, 31, 100, 102, 33].map(uuid)
const cells = ['one', 'two'].map(syllabus_item_id => ({ student_id: student, syllabus_item_id, checked: true }))
const migration = name => new URL(`../supabase/migrations/${name}.sql`, import.meta.url)

test('grading panels and examiners (offline PostgreSQL)', async suite => {
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
  const save = (user, version) => as(user, async () => (await sql(
    "select public.save_instructor_grading_batch($1,$2,$3,'adult','target',$4,$5,false,null) as data",
    [uuid(sequence++), user, event, version, JSON.stringify(cells)])).rows[0].data)
  const setPanel = (user, members, chief = null, target = event) => as(user, async () => (await sql(
    'select public.set_grading_panel($1,$2::uuid[],$3) as panel', [target, members, chief])).rows[0].panel)
  const panel = async (target = event) => (await sql(
    'select instructor_id, is_chief from public.grading_panel_members where grading_event_id=$1 order by instructor_id', [target])).rows
  const examiner = async id => (await sql('select is_examiner from public.instructors where id=$1', [id])).rows[0].is_examiner

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

    await suite.test('backfill makes the assessing instructor chief and keeps existing graders on the panel', async () => {
      assert.deepEqual(await panel(), [{ instructor_id: ia, is_chief: true }, { instructor_id: ib, is_chief: false }])
      assert.deepEqual(await panel(otherEvent), [])
      assert.equal(await examiner(ia), true)
      assert.equal(await examiner(ib), true)
      assert.equal(await examiner(ic), false)
      // Existing batches keep their snapshot, so the legacy draft still saves both students.
      const resumed = await as(b, async () => (await sql(
        "select public.save_instructor_grading_batch($1,$2,$3,'adult','target',$4,$5,false,null) as data",
        [uuid(sequence++), b, event, draft.version, JSON.stringify(legacyCells)])).rows[0].data)
      assert.equal(resumed.version, draft.version + 1)
    })

    await suite.test('instructors off the panel cannot start grading, even if they are examiners', async () => {
      await assert.rejects(save(c, 0), error => error.code === 'PGP01')
      await sql('update public.instructors set is_examiner=true where id=$1', [ic])
      await assert.rejects(save(c, 0), error => error.code === 'PGP01')
      assert.equal((await sql('select count(*)::int as n from public.grading_batches where instructor_id=$1', [ic])).rows[0].n, 0)
    })

    await suite.test('administrators replace panels atomically with at most one chief', async () => {
      const result = await setPanel(admin, [ic, ia, ic], ic)
      assert.deepEqual(result.map(row => [row.instructor_id, row.is_chief]), [[ic, true], [ia, false]])
      assert.deepEqual(await panel(), [{ instructor_id: ia, is_chief: false }, { instructor_id: ic, is_chief: true }])
      const created = await save(c, 0)
      assert.equal(created.version, 1)
      // New batches contain only this grade's applicants, not the walk-in.
      assert.deepEqual(created.students.map(row => row.student_id), [student])
      // B was removed, so B's draft is locked.
      await assert.rejects(as(b, () => sql(
        "select public.save_instructor_grading_batch($1,$2,$3,'adult','target',$4,$5,false,null)",
        [uuid(sequence++), b, event, draft.version + 1, JSON.stringify(legacyCells)])), error => error.code === 'PGP01')
      await assert.rejects(setPanel(admin, [ia], ic), error => error.code === 'PGP04')
      assert.deepEqual((await panel()).map(row => row.instructor_id), [ia, ic])
      assert.deepEqual(await setPanel(admin, []), [])
      const noChief = await setPanel(admin, [ia, ic])
      assert.ok(noChief.every(row => row.is_chief === false))
      await setPanel(admin, [ia, ic], ia)
    })

    await suite.test('only flagged examiners can join a panel', async () => {
      await sql('update public.instructors set is_examiner=false where id=$1', [ib])
      await assert.rejects(setPanel(admin, [ia, ib]), error => error.code === 'PGP02')
      assert.deepEqual((await panel()).map(row => row.instructor_id), [ia, ic])
    })

    await suite.test('only administrators manage panels; instructors can read them and students cannot', async () => {
      for (const user of [a, c, studentUser]) {
        await assert.rejects(setPanel(user, [ia]), error => error.code === '42501')
        await assert.rejects(as(user, () => sql('insert into public.grading_panel_members(grading_event_id,instructor_id) values($1,$2)', [otherEvent, ia])),
          error => error.code === '42501')
        const removed = await as(user, () => sql('delete from public.grading_panel_members returning instructor_id'))
        assert.equal(removed.rows.length, 0)
      }
      assert.equal((await as(a, () => sql('select * from public.grading_panel_members'))).rows.length, 2)
      assert.equal((await as(studentUser, () => sql('select * from public.grading_panel_members'))).rows.length, 0)
      await assert.rejects(as(null, async () => {
        await db.exec('set local role anon')
        return sql('select * from public.grading_panel_members')
      }), error => error.code === '42501')
    })

    await suite.test('instructors read only the panels they sit on', async () => {
      // Panel is now A (chief) and C. B was removed earlier.
      assert.deepEqual((await as(a, () => sql('select instructor_id from public.grading_panel_members order by instructor_id'))).rows
        .map(row => row.instructor_id), [ia, ic])
      assert.equal((await as(b, () => sql('select * from public.grading_panel_members'))).rows.length, 0)
      assert.equal((await as(admin, () => sql('select * from public.grading_panel_members'))).rows.length, 2)
    })

    await suite.test('my_grading_panels lists only the caller\'s sessions with their co-examiners', async () => {
      const mine = user => as(user, async () => (await sql('select public.my_grading_panels() as data')).rows[0].data)
      const [session] = await mine(a)
      assert.equal((await mine(a)).length, 1)
      assert.equal(session.event_id, event)
      assert.equal(session.is_chief, true)
      assert.equal(session.candidates, 2)
      assert.deepEqual(session.centre, { name: 'Test', address: '' })
      assert.deepEqual(session.panel.map(member => [member.instructor_id, member.name, member.is_chief]),
        [[ia, 'A Instructor', true], [ic, 'C Instructor', false]])
      assert.equal((await mine(c))[0].is_chief, false)
      for (const user of [b, studentUser, admin]) assert.deepEqual(await mine(user), [], user)
      await assert.rejects(as(null, async () => {
        await db.exec('set local role anon')
        return sql('select public.my_grading_panels()')
      }), error => error.code === '42501')
    })

    await suite.test('examiner_grading_day lists each target grade with its candidates for panel members only', async () => {
      const day = user => as(user, async () => (await sql('select public.examiner_grading_day($1) as data', [event])).rows[0].data)
      const result = await day(a)
      assert.equal(result.event_id, event)
      assert.equal(result.is_chief, true)
      assert.deepEqual(result.panel.map(member => member.instructor_id), [ia, ic])
      assert.equal(result.grades.length, 1)
      const [target] = result.grades
      assert.equal(target.grade.id, 'target')
      assert.deepEqual(target.candidates.map(row => [row.student_id, row.name, row.member_no]), [[student, 'First Student', '001']])
      const current = (await sql('select current_grade_id from public.students where id=$1', [student])).rows[0].current_grade_id
      assert.equal(target.candidates[0].current_grade?.id ?? null, current)
      if (current) assert.deepEqual(Object.keys(target.candidates[0].current_grade).sort(), ['colour', 'id', 'is_ranked', 'label', 'sort_order'])
      assert.equal(target.my_batch, null)
      assert.equal((await day(c)).grades[0].my_batch.status, 'draft')
      assert.equal((await day(admin)).grades.length, 1)
      for (const user of [b, studentUser]) await assert.rejects(day(user), error => error.code === 'PGP01')
      await assert.rejects(as(a, () => sql('select public.examiner_grading_day($1)', [otherEvent])), error => error.code === 'PGP01')
      await sql("update public.grading_applications set status='withdrawn' where student_id=$1", [student])
      assert.deepEqual((await day(a)).grades[0].candidates, [])
      await sql("update public.grading_applications set status='submitted' where student_id=$1", [student])
    })

    await suite.test('grade sessions have their own times in the grading day and the calendar', async () => {
      await assert.rejects(sql("update public.grading_target_grades set starts_at=now() where grading_event_id=$1", [event]),
        error => error.code === '23514')
      await assert.rejects(sql("update public.grading_target_grades set starts_at=now(), ends_at=now() - interval '1 minute' where grading_event_id=$1", [event]),
        error => error.code === '23514')
      await sql("update public.grading_target_grades set starts_at='2026-11-14T02:00:00Z', ends_at='2026-11-14T02:30:00Z' where grading_event_id=$1", [event])
      const day = await as(a, async () => (await sql('select public.examiner_grading_day($1) as data', [event])).rows[0].data)
      assert.equal(Date.parse(day.grades[0].starts_at), Date.parse('2026-11-14T02:00:00Z'))
      assert.equal(Date.parse(day.grades[0].ends_at), Date.parse('2026-11-14T02:30:00Z'))
      const calendar = user => as(user, async () => (await sql(
        "select public.instructor_calendar(now() - interval '1 day', now() + interval '1 day', 50, 0) as data")).rows[0].data)
      const mine = (await calendar(a)).items.find(item => item.id === event)
      assert.equal(mine.on_panel, true)
      assert.deepEqual(mine.grading.target_grades.map(row => [row.grade.id, row.candidates, Date.parse(row.starts_at)]),
        [['target', 1, Date.parse('2026-11-14T02:00:00Z')]])
      assert.equal((await calendar(b)).items.find(item => item.id === event).on_panel, false)
    })

    await suite.test('examiners on a scheduled panel keep the flag until removed or the grading ends', async () => {
      await assert.rejects(sql('update public.instructors set is_examiner=false where id=$1', [ic]), error => error.code === 'PGP03')
      await sql("update public.events set status='completed' where id=$1", [event])
      await sql('update public.instructors set is_examiner=false where id=$1', [ic])
      assert.equal(await examiner(ic), false)
      await sql("update public.events set status='scheduled' where id=$1", [event])
    })
  } finally {
    await db.close()
  }
})
