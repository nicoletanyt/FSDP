import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const migration = name => new URL(`../supabase/migrations/${name}.sql`, import.meta.url)
const year = new Date().getFullYear()
const [childUser, teenUser, adultUser, blackUser, silverUser, directUser, grownUser] = [1, 2, 3, 4, 5, 6, 7].map(uuid)
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
    for (const [id, role] of [[childUser, 'student'], [teenUser, 'student'], [adultUser, 'student'], [blackUser, 'student'], [silverUser, 'student'], [directUser, 'student'], [grownUser, 'student']]) {
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

    await suite.test('sheet values are written to grade_requirements', async () => {
      const { rows } = await sql("select grade_id, min_age_years, max_age_years from public.grade_requirements where track='adult' and grade_id in ('black-2nd-kyu','junior-dan') order by grade_id")
      assert.deepEqual(rows, [{ grade_id: 'black-2nd-kyu', min_age_years: null, max_age_years: null },
        { grade_id: 'junior-dan', min_age_years: null, max_age_years: 14 }])
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

    await suite.test('attended classes since the last grading count toward sessions', async () => {
      await db.exec(`
        insert into public.events(id,event_type,centre_id,name,starts_at,ends_at) values
          ('${classEvent}','class','${centre}','Class',now() - interval '2 days',now() - interval '2 days' + interval '1 hour');
        insert into public.event_students(event_id,student_id,attendance_status) values('${classEvent}','${black}','present');
      `)
      assert.equal((await readiness(black)).find(row => row.key === 'sessions').actual, '1')
    })
  } finally {
    await db.close()
  }
})
