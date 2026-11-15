import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('membership submission is atomic, owner-scoped and never resets paid credits or awards ranks', async () => {
  const db = new PGlite()
  const user = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  const instructor = '00000000-0000-4000-8000-000000000003'
  const centre = '00000000-0000-4000-8000-000000000004'
  const form = {
    fullName: 'Test Student', nric: 'S1234567A', nationality: 'singaporean', dob: '2000-01-01',
    gender: 'female', email: 'untrusted@example.com', mobile: '91234567', address: 'Test address',
    photoName: 'photo.jpg', principalDojo: centre, membershipType: 'adult', currentBelt: 'black',
    hasExperience: 'yes', experienceDetails: 'Previous training', emergencyName: 'Test Contact',
    emergencyRelationship: 'parent', emergencyPhone: '92345678', medicalDetails: 'Test medical note',
    guardianName: '', guardianNric: '', guardianRelationship: '', guardianPhone: '',
    waiverSigned: true, isDeclared: true, parqAnswers: { heart: false, dizziness: true, joint: false },
  }
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth, public to authenticated;
      create type public.membership_status as enum ('active','expired','pending');
      create type public.follow_up_status as enum ('none','flagged','contacted','resolved');
      create table public.users (id uuid primary key, email text unique, role text);
      create table public.centres (id uuid primary key, name text, status text);
      create table public.grades (id text primary key, label text);
      insert into public.users values ('${user}','student@example.com','student'),
        ('${other}','other@example.com','student'), ('${instructor}','teacher@example.com','instructor');
      insert into public.centres values ('${centre}','Real dojo','active');
      insert into public.grades values ('unranked','Unranked'), ('1st-dan','1st Dan');
      create table public.credit_accounts (user_id uuid primary key, credits integer default 0,
        unlimited boolean default false, active boolean default true, membership_type text default 'adult');
    `)
    const schema = await readFile(new URL('../supabase/migrations/20261102041227_reset_and_domain_schema.sql', import.meta.url), 'utf8')
    for (const table of ['students', 'emergency_contacts', 'student_medical_alerts']) {
      const ddl = schema.match(new RegExp(`create table public\\.${table} \\([\\s\\S]*?\\n\\);`))?.[0]
      assert.ok(ddl)
      await db.exec(ddl)
    }
    const migration = await readFile(new URL('../supabase/migrations/20261114142809_membership_application_submit.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration) // SQL Editor can safely run this additive repair again.
    const numberMigration = await readFile(new URL('../supabase/migrations/20261114145709_fix_membership_id_generation.sql', import.meta.url), 'utf8')
    await db.exec(numberMigration)
    await db.exec(numberMigration)
    const persistedMigration = await readFile(new URL('../supabase/migrations/20261114160222_persist_asj_membership_id.sql', import.meta.url), 'utf8')
    await db.exec(persistedMigration)
    await db.exec(persistedMigration)
    const confirmationMigration = await readFile(new URL('../supabase/migrations/20261114161341_membership_application_confirmation.sql', import.meta.url), 'utf8')
    await db.exec(confirmationMigration)
    await db.exec(confirmationMigration)

    async function confirmation(account, role = 'authenticated') {
      await db.exec(`begin; set local role ${role};`)
      try {
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [account ?? ''])
        const response = await db.query('select public.get_my_membership_application() as result')
        await db.exec('commit')
        return response.rows[0].result
      } catch (error) {
        await db.exec('rollback')
        throw error
      }
    }

    async function submit(account, application = form, role = 'authenticated') {
      await db.exec(`begin; set local role ${role};`)
      try {
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [account ?? ''])
        const result = await db.query('select public.submit_my_membership_application($1::jsonb) as result', [JSON.stringify(application)])
        await db.exec('commit')
        return result.rows[0].result
      } catch (error) {
        await db.exec('rollback')
        throw error
      }
    }
    await assert.rejects(submit(null), /sign in/)
    await assert.rejects(submit(user, form, 'anon'), /permission denied/)
    await assert.rejects(submit(instructor), /Only student/)
    await assert.rejects(submit(user, { ...form, isDeclared: false }), /waiver and declaration/)
    await assert.rejects(submit(user, { ...form, principalDojo: other }), /active dojo/)
    await assert.rejects(submit(user, { ...form, dob: '2015-01-01' }), /Guardian/)
    assert.equal((await db.query('select count(*)::int as count from public.students')).rows[0].count, 0)

    const first = await submit(user, { ...form, user_id: other, credits: 99999, current_grade_id: '1st-dan' })
    assert.equal(first.status, 'pending')
    assert.equal(first.beltRank, 'Black Belt')
    assert.equal(first.declaredBelt, 'black')
    assert.equal(first.verifiedRank, 'Unranked')
    assert.match(first.membershipId, /^ASJ\d{4}[1-9]\d{3}$/)
    assert.equal(first.membershipId.slice(3, 7), String(new Date().getUTCFullYear()))
    const member = (await db.query('select * from public.students')).rows[0]
    assert.equal(member.user_id, user)
    assert.notEqual(member.id, first.membershipId)
    assert.equal(member.email, 'student@example.com')
    const saved = (await db.query('select * from membership_private.application_details')).rows[0]
    assert.equal(saved.user_id, user)
    assert.equal(saved.form_data.email, 'student@example.com')
    for (const key of Object.keys(form).filter(key => key !== 'email')) assert.deepEqual(saved.form_data[key], form[key])
    assert.deepEqual(await confirmation(user), first)
    assert.equal(await confirmation(other), null)
    await assert.rejects(confirmation(null), /authentication required/)
    await assert.rejects(confirmation(instructor), /authentication required/)
    await assert.rejects(confirmation(user, 'anon'), /permission denied/)
    assert.equal(first.nric, undefined)
    assert.equal(first.medicalDetails, undefined)
    assert.equal(first.form_data, undefined)
    const yellow = await submit(user, { ...form, currentBelt: 'yellow' })
    assert.equal(yellow.beltRank, 'Yellow Belt')
    assert.equal(yellow.verifiedRank, 'Unranked')
    assert.equal((await confirmation(user)).beltRank, 'Yellow Belt')
    assert.equal((await db.query('select current_grade_id from public.students where user_id = $1', [user])).rows[0].current_grade_id, 'unranked')
    assert.equal((await db.query('select * from public.emergency_contacts')).rows[0].relationship, 'parent')
    assert.equal((await db.query('select * from public.credit_accounts')).rows[0].active, false)

    await db.query('update public.credit_accounts set credits = 35, unlimited = true, active = true where user_id = $1', [user])
    assert.equal((await submit(user)).membershipId, first.membershipId)
    assert.equal((await db.query('select count(*)::int as count from public.emergency_contacts')).rows[0].count, 1)
    assert.equal((await db.query('select count(*)::int as count from public.student_medical_alerts')).rows[0].count, 1)
    assert.deepEqual((await db.query('select credits, unlimited, active from public.credit_accounts')).rows[0], {
      credits: 35, unlimited: true, active: true,
    })

    const otherResult = await submit(other, { ...form, fullName: 'Other' })
    assert.notEqual(otherResult.membershipId, first.membershipId)
    // Existing UUID numbers can be repaired explicitly without changing PKs.
    await db.query('update public.students set member_no = $1 where user_id = $2', ['IMPORTED-123', other])
    assert.equal((await submit(other, { ...form, fullName: 'Other' })).membershipId, 'IMPORTED-123')
    const otherId = (await db.query('select id from public.students where user_id = $1', [other])).rows[0].id
    await db.query('select setseed(0.42)')
    const collision = (await db.query("select 'ASJ' || extract(year from current_date)::text || lpad(floor(random() * 9000 + 1000)::text, 4, '0') as number")).rows[0].number
    await db.query('update public.students set member_no = $1 where user_id = $2', [collision, other])
    await db.query('select setseed(0.42)')
    await db.query('update public.students set member_no = id::text where user_id = $1', [other])
    const repaired = (await db.query('select id, member_no from public.students where user_id = $1', [other])).rows[0]
    assert.equal(repaired.id, otherId)
    assert.notEqual(repaired.member_no, collision)
    assert.match(repaired.member_no, /^ASJ\d{4}[1-9]\d{3}$/)
    await db.query("update public.students set membership_status = 'active', current_grade_id = '1st-dan' where user_id = $1", [user])
    assert.equal((await submit(user, { ...form, fullName: 'Changed Name' })).status, 'active')
    assert.equal((await db.query('select first_name from public.students where user_id = $1', [user])).rows[0].first_name, 'Test')

    // Simulate a historical UUID number. Public RPC repairs only its caller,
    // including active memberships, and returns the actual persisted number.
    await db.exec('alter table public.students disable trigger assign_asj_membership_number')
    await db.query('update public.students set member_no = id::text')
    await db.exec('alter table public.students enable trigger assign_asj_membership_number')
    const legacy = await submit(user)
    assert.match(legacy.membershipId, /^ASJ\d{4}[1-9]\d{3}$/)
    assert.equal(legacy.status, 'active')
    const actual = (await db.query('select member_no from public.students where user_id = $1', [user])).rows[0].member_no
    assert.equal(legacy.membershipId, actual)
    assert.equal((await submit(user)).membershipId, actual)
    assert.equal((await db.query('select member_no = id::text as unchanged from public.students where user_id = $1', [other])).rows[0].unchanged, true)

    await db.exec('begin; set local role authenticated;')
    await assert.rejects(db.query('select * from membership_private.application_details'), /permission denied/)
    await db.exec('rollback')
    // A late write failure must roll back the student, private snapshot and contacts.
    await db.exec(`create function reject_contact() returns trigger language plpgsql as $$
      begin raise exception 'contact unavailable'; end; $$;
      create trigger reject_contact before insert on public.emergency_contacts for each row execute function reject_contact();`)
    await assert.rejects(submit(other, { ...form, fullName: 'Should Rollback' }), /contact unavailable/)
    assert.equal((await db.query('select first_name from public.students where user_id = $1', [other])).rows[0].first_name, 'Other')
  } finally {
    await db.close()
  }
})
