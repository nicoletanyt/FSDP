import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const migration = name => new URL(`../supabase/migrations/${name}.sql`, import.meta.url)
const year = new Date().getFullYear()
const [childUser, teenUser, adultUser, blackUser, silverUser, directUser, grownUser, instructorUser] = [1, 2, 3, 4, 5, 6, 7, 8].map(uuid)
const instructor = uuid(50)
const [centre, child, teen, adult, black, silver, direct, grown, classEvent, gradingEvent] = [20, 31, 32, 33, 34, 35, 36, 37, 100, 101].map(uuid)

test('grading eligibility follows the published sheets (offline PostgreSQL)', async suite => {
  const db = new PGlite()
  const sql = (text, args = []) => db.query(text, args)
  const readiness = async student => (await sql(
    'select target_grade_id, key, actual, required, met from public.student_grading_readiness($1) order by sort', [student])).rows
  async function as(user, run) {
    await db.exec('begin; set local role authenticated;')
    try {
      await sql("select set_config('request.jwt.claim.sub',$1,true)", [user])
      return await run()
    } finally { await db.exec('rollback') }
  }

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
      '20261102041227_reset_and_domain_schema', '20261103185301_grading_checkout']) {
      await db.exec(await readFile(migration(name), 'utf8'))
    }
    await db.exec((await readFile(migration('20261104055444_official_grading_schedule'), 'utf8')).split('-- Keep the send history')[0])
    for (const [id, role] of [[childUser, 'student'], [teenUser, 'student'], [adultUser, 'student'], [blackUser, 'student'], [silverUser, 'student'], [directUser, 'student'], [grownUser, 'student'], [instructorUser, 'instructor']]) {
      await sql('insert into auth.users(id,email,raw_app_meta_data) values($1,$2,$3)', [id, `${id}@example.test`, JSON.stringify({ role })])
    }
    // Pre-fix values: adult 2nd Kyu gated at 12 and Junior Dan open to every age.
    await db.exec(`
      insert into public.centres(id,name,short_name) values('${centre}','Test','test');
      insert into public.grades(id,label,colour,is_ranked,sort_order) values
        ('unranked','Unranked',null,false,0),('red-12th-kyu','Red (12th Kyu)','Red',true,1),
        ('brown-gold-3rd-kyu','Brown-Gold (3rd Kyu)','Brown',true,12),('black-2nd-kyu','Black (2nd Kyu)','Black',true,13),
        ('black-silver-2nd-kyu','Black-Silver (2nd Kyu)','Black',true,14),
        ('black-gold-1st-kyu','Black-Gold (1st Kyu)','Black',true,15),('junior-dan','Junior Dan','Black',true,16),('1st-dan','1st Dan','Black',true,17);
      insert into public.grade_tracks values('red-12th-kyu','children'),('black-silver-2nd-kyu','children'),('brown-gold-3rd-kyu','adult'),('black-2nd-kyu','adult'),
        ('black-gold-1st-kyu','adult'),('junior-dan','adult'),('1st-dan','adult');
      insert into public.grade_requirements(grade_id,track,min_months,min_sessions,min_age_years) values
        ('red-12th-kyu','children',3,null,5),('black-silver-2nd-kyu','children',10,null,null),('brown-gold-3rd-kyu','adult',6,36,null),('black-2nd-kyu','adult',6,56,12),
        ('black-gold-1st-kyu','adult',9,62,null),('junior-dan','adult',9,62,null),('1st-dan','adult',9,70,15);
      insert into public.students(id,user_id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,joined_at,current_grade_id,last_graded_at) values
        ('${child}','${childUser}','001','Child','Student','c@example.test','${centre}','${year - 6}-06-01',current_date - 365,'unranked',null),
        ('${teen}','${teenUser}','002','Teen','Student','t@example.test','${centre}','${year - 14}-06-01','2015-01-01','black-gold-1st-kyu',current_date - 400),
        ('${adult}','${adultUser}','003','Adult','Student','a@example.test','${centre}','1990-01-01','2015-01-01','black-gold-1st-kyu',current_date - 400),
        ('${black}','${blackUser}','004','Black','Student','b@example.test','${centre}','${year - 13}-01-01','2015-01-01','brown-gold-3rd-kyu',current_date - 400),
        ('${silver}','${silverUser}','005','Silver','Child','s@example.test','${centre}','${year - 10}-06-01','2018-01-01','black-silver-2nd-kyu',current_date - 400),
        ('${direct}','${directUser}','006','Direct','Adult','d@example.test','${centre}','1995-01-01','2015-01-01','black-silver-2nd-kyu',current_date - 30),
        ('${grown}','${grownUser}','007','Grown','Child','g@example.test','${centre}','${year - 14}-01-01','2015-01-01','black-silver-2nd-kyu','${year - 2}-06-01');
    `)
    await db.exec(await readFile(migration('20261112160000_grading_eligibility_sheet'), 'utf8'))
    await db.exec(await readFile(migration('20261112170000_grading_adult_crossover'), 'utf8'))
    await db.exec(await readFile(migration('20261112180000_grading_intermediate_direct_entry'), 'utf8'))
    await db.exec(`
      insert into public.grades(id,label,colour,is_ranked,sort_order) values
        ('red-gold-11th-kyu','Red Gold (11th Kyu)','Red',true,2),
        ('yellow-10th-kyu','Yellow (10th Kyu)','Yellow',true,3),
        ('orange-9th-kyu','Orange (9th Kyu)','Orange',true,4),
        ('green-8th-kyu','Green (8th Kyu)','Green',true,5),
        ('purple-7th-kyu','Purple (7th Kyu)','Purple',true,6),
        ('blue-6th-kyu','Blue (6th Kyu)','Blue',true,7),
        ('blue-silver-6th-kyu','Blue Silver (6th Kyu)','Blue',true,8),
        ('blue-gold-5th-kyu','Blue Gold (5th Kyu)','Blue',true,9),
        ('brown-4th-kyu','Brown (4th Kyu)','Brown',true,10),
        ('brown-silver-4th-kyu','Brown Silver (4th Kyu)','Brown',true,11);
    `)
    await db.exec(await readFile(migration('20261106062729_grading_fees'), 'utf8'))
    await db.exec(await readFile(migration('20261116064918_grading_track_requirements_and_fees'), 'utf8'))
    await db.exec(await readFile(migration('20261113100000_grading_endorsements'), 'utf8'))
    await db.exec(await readFile(migration('20261113110000_grading_endorsements_surrogate_key'), 'utf8'))
    await sql("insert into public.instructors(id,user_id,first_name,last_name,email) values($1,$2,'Ada','Sensei','ada@example.test')", [instructor, instructorUser])

    await suite.test('sheet values are written to grade_requirements', async () => {
      const { rows } = await sql("select grade_id, min_age_years, max_age_years from public.grade_requirements where track='adult' and grade_id in ('black-2nd-kyu','junior-dan') order by grade_id")
      assert.deepEqual(rows, [{ grade_id: 'black-2nd-kyu', min_age_years: null, max_age_years: null },
        { grade_id: 'junior-dan', min_age_years: null, max_age_years: 14 }])
    })

    await suite.test('adult and child Blue use different minimums, but the same S$50 fee', async () => {
      const rows = (await sql(`select track,min_months,min_sessions,fee_cents from public.grade_requirements
        where grade_id='blue-6th-kyu' order by track::text`)).rows
      assert.deepEqual(rows, [
        { track: 'adult', min_months: 3, min_sessions: 20, fee_cents: 5000 },
        { track: 'children', min_months: 6, min_sessions: null, fee_cents: 5000 },
      ])
      assert.deepEqual((await sql(`select track,min_months,min_sessions,fee_cents from public.grade_requirements
        where grade_id='blue-gold-5th-kyu' order by track::text`)).rows, [
        { track: 'adult', min_months: 0, min_sessions: 24, fee_cents: 5500 },
        { track: 'children', min_months: 6, min_sessions: null, fee_cents: 5500 },
      ])
      assert.equal((await sql("select min_sessions from public.grade_requirements where grade_id='brown-4th-kyu' and track='adult'")).rows[0].min_sessions, 32)
    })

    await suite.test('the readiness RPC actually applies the age-specific Blue requirements', async () => {
      const adultBlue = uuid(201), childBlue = uuid(202)
      await sql(`insert into public.students(id,member_no,first_name,last_name,email,home_centre_id,date_of_birth,joined_at,current_grade_id,last_graded_at)
        values($1,'BLUE-ADULT','Adult','Blue','blue-adult@example.test',$3,'1990-01-01',current_date-100,'unranked',null),
        ($2,'BLUE-CHILD','Child','Blue','blue-child@example.test',$3,make_date($4,1,1),current_date-400,'purple-7th-kyu',current_date-100)`,
        [adultBlue,childBlue,centre,year-10])
      const adultRows = await readiness(adultBlue), childRows = await readiness(childBlue)
      assert.equal(adultRows[0].target_grade_id, 'blue-6th-kyu')
      assert.equal(childRows[0].target_grade_id, 'blue-6th-kyu')
      assert.equal(adultRows.find(row => row.key === 'time').required, '3 months')
      assert.equal(adultRows.find(row => row.key === 'time').met, true)
      assert.equal(adultRows.find(row => row.key === 'sessions').required, '20')
      assert.equal(adultRows.find(row => row.key === 'sessions').met, false)
      assert.equal(childRows.find(row => row.key === 'time').required, '6 months')
      assert.equal(childRows.find(row => row.key === 'time').met, false)
      assert.equal(childRows.some(row => row.key === 'sessions'), false)
      await sql('update public.students set last_graded_at=current_date-200 where id=$1',[childBlue])
      assert.equal((await readiness(childBlue)).find(row => row.key === 'time').met, true)
    })

    await suite.test('Junior Dan is for 14 and below; older 1st Kyu holders target 1st Dan', async () => {
      const teenRows = await readiness(teen)
      assert.equal(teenRows[0].target_grade_id, 'junior-dan')
      assert.deepEqual(teenRows.find(row => row.key === 'max-age'), { target_grade_id: 'junior-dan', key: 'max-age', actual: '14 years', required: '14 years', met: true })
      const adultRows = await readiness(adult)
      assert.equal(adultRows[0].target_grade_id, '1st-dan')
      assert.equal(adultRows.some(row => row.key === 'max-age'), false)
      assert.deepEqual(adultRows.find(row => row.key === 'age'), { target_grade_id: '1st-dan', key: 'age', actual: `${year - 1990} years`, required: '15 years', met: true })
    })

    await suite.test('adult 2nd Kyu has no age rule', async () => {
      const rows = await readiness(black)
      assert.equal(rows[0].target_grade_id, 'black-2nd-kyu')
      assert.equal(rows.some(row => row.key === 'age'), false)
      assert.deepEqual(rows.find(row => row.key === 'sessions'), { target_grade_id: 'black-2nd-kyu', key: 'sessions', actual: '0', required: '56', met: false })
    })

    await suite.test('a Black-Silver child sees the first adult grade, gated on turning 13 by year', async () => {
      const rows = (await sql('select target_grade_id, track, key, actual, required, met from public.student_grading_readiness($1) order by sort', [silver])).rows
      assert.equal(rows[0].target_grade_id, 'black-gold-1st-kyu')
      assert.equal(rows[0].track, 'adult')
      assert.deepEqual(rows.find(row => row.key === 'adult-age'),
        { target_grade_id: 'black-gold-1st-kyu', track: 'adult', key: 'adult-age', actual: '10 years', required: '13 years', met: false })
      assert.equal((await readiness(teen)).some(row => row.key === 'adult-age'), false, 'already on the adult track')
    })

    await suite.test('an intermediate grade from an adult grading submits directly for the next adult grade', async () => {
      const rows = await readiness(direct)
      assert.equal(rows[0].target_grade_id, 'black-gold-1st-kyu')
      assert.deepEqual(rows.map(row => row.key), ['membership', 'membership-length', 'direct-entry', 'fees'])
      assert.equal(rows.find(row => row.key === 'direct-entry').met, true)
    })

    await suite.test('an intermediate grade from a children\'s grading keeps the adult minimums', async () => {
      // Graded Black-Silver aged 12 (by year), now 14: a children's award.
      const rows = await readiness(grown)
      assert.equal(rows[0].target_grade_id, 'black-gold-1st-kyu')
      assert.deepEqual(rows.map(row => row.key), ['membership', 'membership-length', 'time', 'sessions', 'fees'])
    })

    await suite.test('children count practice since joining and the minimum age', async () => {
      const rows = await readiness(child)
      assert.deepEqual(rows.map(row => [row.key, row.met]), [['membership', true], ['membership-length', true], ['age', true], ['time', true], ['fees', true]])
    })

    await suite.test('eligible_grading_students uses the same readiness rules', async () => {
      await db.exec(`
        insert into public.events(id,event_type,centre_id,name,starts_at,ends_at) values
          ('${gradingEvent}','grading','${centre}','Children grading',now() + interval '30 days',now() + interval '30 days 2 hours');
        insert into public.gradings(event_id,track,application_deadline,application_status) values('${gradingEvent}','children',current_date + 10,'open');
        insert into public.grading_target_grades values('${gradingEvent}','red-12th-kyu');
      `)
      const { rows } = await sql('select student_id, target_grade_id from public.eligible_grading_students($1)', [gradingEvent])
      assert.deepEqual(rows, [{ student_id: child, target_grade_id: 'red-12th-kyu' }])
      await sql("update public.students set outstanding_fees = true where id = $1", [child])
      assert.equal((await sql('select * from public.eligible_grading_students($1)', [gradingEvent])).rows.length, 0)
      await sql("update public.students set outstanding_fees = false where id = $1", [child])
    })

    await suite.test('a student reads only their own checklist', async () => {
      const own = await as(teenUser, async () => (await sql('select target_grade_id, key from public.my_grading_readiness()')).rows)
      assert.equal(own[0].target_grade_id, 'junior-dan')
      await assert.rejects(as(teenUser, () => sql('select * from public.student_grading_readiness($1)', [adult])), { code: '42501' })
    })

    await suite.test('instructors endorse only students who meet every requirement, once per target grade', async () => {
      const status = student => as(instructorUser, async () => (await sql('select public.grading_endorsement_status($1) as data', [student])).rows[0].data)
      // Endorsements must persist between calls, so these run in committed transactions.
      const endorse = async (student, grade) => {
        await db.exec('begin; set local role authenticated;')
        try {
          await sql("select set_config('request.jwt.claim.sub',$1,true)", [instructorUser])
          const data = (await sql('select public.endorse_grading_student($1,$2) as data', [student, grade])).rows[0].data
          await db.exec('commit')
          return data
        } catch (error) { await db.exec('rollback'); throw error }
      }
      // The child meets every requirement for Red (12th Kyu).
      assert.deepEqual(await status(child), { target_grade_id: 'red-12th-kyu', eligible: true, endorsement: null })
      // Not eligible: the teen lacks months/sessions for Junior Dan.
      assert.equal((await status(teen)).eligible, false)
      await assert.rejects(endorse(teen, 'junior-dan'), /does not meet every grading requirement/)
      // A stale target grade is refused.
      await assert.rejects(endorse(child, 'black-2nd-kyu'), /next grade has changed/)
      const endorsed = await endorse(child, 'red-12th-kyu')
      assert.equal(endorsed.endorsement.endorsed_by, 'Ada Sensei')
      assert.ok(endorsed.endorsement.endorsed_at)
      const again = await endorse(child, 'red-12th-kyu')
      assert.equal(again.endorsement.endorsed_at, endorsed.endorsement.endorsed_at, 'the first endorsement is kept')
      // Students cannot read or create endorsements.
      await assert.rejects(as(childUser, () => sql('select public.endorse_grading_student($1,$2)', [child, 'red-12th-kyu'])), /Only instructors/)
      await assert.rejects(as(childUser, () => sql('select public.grading_endorsement_status($1)', [child])), /Only instructors/)
      // The grading checklist sees endorsements matching each application's target grade.
      await sql("insert into public.grading_applications(student_id,grading_event_id,target_grade_id) values($1,$2,'red-12th-kyu')", [child, gradingEvent])
      const listed = await as(instructorUser, async () => (await sql('select public.grading_event_endorsements($1) as data', [gradingEvent])).rows[0].data)
      assert.deepEqual(listed.map(row => [row.student_id, row.target_grade_id, row.endorsed_by]), [[child, 'red-12th-kyu', 'Ada Sensei']])
      await sql('delete from public.grading_applications where student_id = $1', [child])
      await sql('delete from public.grading_endorsements where student_id = $1', [child])
    })

    await suite.test('attended classes since the last grading count toward sessions', async () => {
      await db.exec(`
        insert into public.events(id,event_type,centre_id,name,starts_at,ends_at) values
          ('${classEvent}','class','${centre}','Class',now() - interval '2 days',now() - interval '2 days' + interval '1 hour');
        insert into public.event_students(event_id,student_id,attendance_status) values('${classEvent}','${black}','present');
      `)
      assert.equal((await readiness(black)).find(row => row.key === 'sessions').actual, '1')
    })

    await suite.test('technique progress is tracked separately from eligibility, with an audit trail', async () => {
      const item = 'children/red-12th-kyu/basics/rolls'
      await sql("insert into public.syllabus_items(id,grade_id,track,category,sort_order,label) values($1,'red-12th-kyu','children','Basics',1,'Rolls')", [item])
      await sql("insert into public.syllabus_items(id,grade_id,track,category,sort_order,label) values($1,'red-12th-kyu','children','Basics',2,'Falls')", [`${item}-2`])
      await sql('insert into public.technique_sign_offs(student_id,syllabus_item_id,signed_off_by) values($1,$2,$3)', [teen, `${item}-2`, instructor])
      // Before the change an unsigned technique blocks readiness.
      assert.equal((await readiness(child)).find(row => row.key === 'techniques').met, false)

      // Reproduce the live table: an event-scoped key instead of (student, item), plus the
      // retired grading-time functions and triggers that exist outside these migrations.
      await db.exec(`
        alter table public.technique_sign_offs drop constraint technique_sign_offs_student_id_syllabus_item_id_key;
        alter table public.technique_sign_offs add column event_id uuid references public.gradings(event_id) on delete cascade;
        alter table public.technique_sign_offs add constraint technique_sign_offs_event_student_item_key
          unique nulls not distinct (event_id, student_id, syllabus_item_id);
        create index technique_sign_offs_student_syllabus_idx on public.technique_sign_offs(student_id, syllabus_item_id);
        alter policy "Admins and instructors manage sign offs" on public.technique_sign_offs rename to "Admins manage sign offs";
        create function public.start_assessment_from_technique() returns trigger language plpgsql as $$ begin return new; end $$;
        create trigger technique_sign_off_starts_assessment after insert on public.technique_sign_offs
          for each row when (new.event_id is not null) execute function public.start_assessment_from_technique();
        create function public.instructor_assessment_checklist(target_event uuid, target_student uuid) returns jsonb
          language sql as $$ select to_jsonb(count(*)) from public.technique_sign_offs where event_id = target_event $$;
      `)
      await sql('insert into public.technique_sign_offs(student_id,syllabus_item_id,event_id) values($1,$2,$3)', [teen, item, gradingEvent])
      await db.exec(await readFile(migration('20261116153017_technique_progress_not_eligibility'), 'utf8'))
      await db.exec(await readFile(migration('20261116153041_technique_progress'), 'utf8'))
      // The retired path is gone and progress has one record per student and technique.
      assert.deepEqual((await sql(`select to_regprocedure('public.instructor_assessment_checklist(uuid,uuid)') as checklist,
        to_regprocedure('public.start_assessment_from_technique()') as starts,
        (select count(*)::int from pg_trigger where tgrelid = 'public.technique_progress'::regclass and not tgisinternal and tgname <> 'technique_progress_history') as triggers,
        (select count(*)::int from information_schema.columns where table_name = 'technique_progress' and column_name = 'event_id') as event_column,
        (select count(*)::int from pg_policies where tablename = 'technique_progress' and policyname = 'Admins manage sign offs') as old_policy,
        (select pg_get_constraintdef(oid) from pg_constraint where conname = 'technique_progress_student_id_syllabus_item_id_key') as unique_key`)).rows,
        [{ checklist: null, starts: null, triggers: 0, event_column: 0, old_policy: 0, unique_key: 'UNIQUE (student_id, syllabus_item_id)' }])

      assert.equal((await readiness(child)).some(row => row.key === 'techniques'), false)
      assert.ok((await readiness(child)).every(row => row.met), 'unassessed techniques no longer block eligibility')
      assert.deepEqual((await sql('select student_id from public.eligible_grading_students($1)', [gradingEvent])).rows, [{ student_id: child }])
      // Existing sign-offs become Consistent.
      assert.deepEqual((await sql('select status, updated_by from public.technique_progress where student_id=$1', [teen])).rows,
        [{ status: 'consistent', updated_by: instructor }])

      await as(instructorUser, async () => {
        const set = async (status, note) => (await sql('select public.set_technique_progress($1,$2,$3::public.technique_status,$4) as data',
          [child, item, status, note])).rows[0].data
        const first = await set('developing', '  Tuck the chin  ')
        assert.equal(first.status, 'developing')
        assert.equal(first.note, 'Tuck the chin')
        assert.equal(first.updated_by, instructor)
        assert.equal(first.instructor.first_name, 'Ada')
        assert.equal((await set('developing', 'Tuck the chin')).updated_at, first.updated_at, 'saving the same values changes nothing')
        assert.equal((await set('consistent', null)).status, 'consistent')
        assert.equal(await set(null, '  '), null)
        assert.equal((await sql('select count(*)::int as n from public.technique_progress where student_id=$1', [child])).rows[0].n, 0)
        const history = (await sql(`select previous_status, new_status, note, changed_by from public.technique_progress_history
          where student_id=$1 order by changed_at, ctid`, [child])).rows
        assert.deepEqual(history.map(row => [row.previous_status, row.new_status, row.note]),
          [[null, 'developing', 'Tuck the chin'], ['developing', 'consistent', null], ['consistent', null, null]])
        assert.ok(history.every(row => row.changed_by === instructor))
        await assert.rejects(sql("select public.set_technique_progress($1,'missing-item','consistent',null)", [child]), /Technique not found/)
      })
      // Direct writes are refused; instructors use the RPC.
      await assert.rejects(as(instructorUser, () => sql("insert into public.technique_progress(student_id,syllabus_item_id,status,updated_by) values($1,$2,'consistent',$3)",
        [child, item, instructor])), { code: '42501' })
      await assert.rejects(as(instructorUser, () => sql('insert into public.technique_progress_history(student_id,syllabus_item_id) values($1,$2)', [child, item])))
      await assert.rejects(as(childUser, () => sql("select public.set_technique_progress($1,$2,'consistent',null)", [child, item])), /Only instructors/)
      // Students can read their own progress but never the audit trail.
      await as(instructorUser, () => sql("select public.set_technique_progress($1,$2,'introduced',null)", [teen, item]))
      assert.equal((await sql('select count(*)::int as n from public.technique_progress_history')).rows[0].n, 0, 'rolled back')
      assert.equal(await as(teenUser, async () => (await sql('select * from public.technique_progress_history')).rows.length), 0)
      assert.equal(await as(teenUser, async () => (await sql('select * from public.technique_progress')).rows.length), 1)
    })
  } finally {
    await db.close()
  }
})
