import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationsDir = new URL('../supabase/migrations/', import.meta.url)
const users = {
  jess: '00000000-0000-4000-8000-0000000000a1', // student with a primary emergency contact
  kai: '00000000-0000-4000-8000-0000000000a2', // student without any emergency contact
  newbie: '00000000-0000-4000-8000-0000000000a3', // signed up, no student record yet
  ken: '00000000-0000-4000-8000-0000000000b1', // instructor
}
const students = { jess: '00000000-0000-4000-8000-0000000000c1', kai: '00000000-0000-4000-8000-0000000000c2' }

test('students update their own phone and emergency contact (offline PostgreSQL)', async (suite) => {
  const db = new PGlite()

  // Runs as the signed-in user and commits, like a real request.
  async function as(role, userId, sql, params = []) {
    await db.exec(`begin; set local role ${role};`)
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ''])
      const { rows: [row] } = await db.query(sql, params)
      await db.exec('commit')
      return row
    } catch (error) {
      await db.exec('rollback')
      throw error
    }
  }
  const update = (who, details) =>
    as('authenticated', users[who], 'select public.update_my_student_profile($1::jsonb) as r', [JSON.stringify(details)])
      .then((row) => row.r)
  const snapshot = async (student) => (await db.query(`
    select s.phone, s.first_name, s.date_of_birth::text as dob,
      (select json_agg(json_build_object('name', e.name, 'relationship', e.relationship, 'phone', e.phone, 'primary', e.is_primary) order by e.is_primary desc, e.name)
        from public.emergency_contacts e where e.student_id = s.id) as contacts
    from public.students s where s.id = $1`, [student])).rows[0]

  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text,
        raw_user_meta_data jsonb not null default '{}',
        raw_app_meta_data jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
    `)
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql') && f <= '20261102041227_reset_and_domain_schema.sql')
      .sort()
    for (const file of files) await db.exec(await readFile(new URL(file, migrationsDir), 'utf8'))
    await db.exec(await readFile(new URL('20261115062900_student_profile_editing.sql', migrationsDir), 'utf8'))

    for (const [key, id] of Object.entries(users)) {
      await db.query('insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)',
        [id, `${key}@example.test`, key === 'ken' ? '{"role":"instructor"}' : '{}'])
    }
    await db.exec(`
      insert into public.grades (id, label, sort_order, is_ranked) values ('unranked', 'Unranked', 0, false);
      insert into public.centres (id, name, short_name) values ('00000000-0000-4000-8000-0000000000f1', 'Bishan Dojo', 'BSH');
      insert into public.students (id, user_id, member_no, first_name, last_name, email, phone, home_centre_id,
          date_of_birth, joined_at, current_grade_id, membership_status) values
        ('${students.jess}', '${users.jess}', 'M1', 'Jess', 'Tan', 'jess@example.test', '+65 9000 0001',
          '00000000-0000-4000-8000-0000000000f1', '1995-01-01', '2025-01-01', 'unranked', 'active'),
        ('${students.kai}', '${users.kai}', 'M2', 'Kai', 'Lim', 'kai@example.test', null,
          '00000000-0000-4000-8000-0000000000f1', '2012-01-01', '2025-01-01', 'unranked', 'pending');
      insert into public.emergency_contacts (student_id, name, relationship, phone, is_primary) values
        ('${students.jess}', 'Mum', 'Mother', '+65 9111 1111', true),
        ('${students.jess}', 'Aunt May', 'Aunt', '+65 9222 2222', false);
      grant select on all tables in schema public to authenticated;
    `)

    await suite.test('a student updates their phone number', async () => {
      const r = await update('jess', { phone: '+65 8123 4567' })
      assert.equal(r.phone, '+65 8123 4567')
      assert.equal((await snapshot(students.jess)).phone, '+65 8123 4567')
    })

    await suite.test('updating the emergency contact replaces only the primary contact', async () => {
      const r = await update('jess', { emergency_contact: { name: ' Dad ', relationship: 'Father', phone: '9333 3333' } })
      assert.deepEqual(r.emergency_contact, { name: 'Dad', relationship: 'Father', phone: '9333 3333' })
      assert.deepEqual((await snapshot(students.jess)).contacts, [
        { name: 'Dad', relationship: 'Father', phone: '9333 3333', primary: true },
        { name: 'Aunt May', relationship: 'Aunt', phone: '+65 9222 2222', primary: false },
      ])
    })

    await suite.test('a student without a contact gets one created; both fields can change together', async () => {
      const r = await update('kai', { phone: '91234567', emergency_contact: { name: 'Mum', relationship: 'Mother', phone: '+65 9444 4444' } })
      assert.deepEqual(r, { phone: '91234567', emergency_contact: { name: 'Mum', relationship: 'Mother', phone: '+65 9444 4444' } })
      assert.equal((await snapshot(students.kai)).contacts.length, 1)
    })

    await suite.test('invalid or incomplete details are rejected and nothing changes', async () => {
      const before = await snapshot(students.jess)
      for (const [details, message] of [
        [{ phone: '' }, /valid phone number/],
        [{ phone: 'call me' }, /valid phone number/],
        [{ phone: '123' }, /valid phone number/],
        [{ emergency_contact: { name: 'Dad', relationship: '', phone: '93333333' } }, /Complete your emergency contact/],
        [{ emergency_contact: { name: 'Dad', relationship: 'Father', phone: 'x' } }, /valid emergency contact number/],
        [{ emergency_contact: 'Dad' }, /Complete your emergency contact/],
        [{}, /Nothing to update/],
      ]) {
        await assert.rejects(update('jess', details), message, JSON.stringify(details))
      }
      assert.deepEqual(await snapshot(students.jess), before)
    })

    await suite.test('staff-managed fields cannot be changed through this function', async () => {
      const before = await snapshot(students.jess)
      for (const key of ['first_name', 'date_of_birth', 'address', 'medical_details', 'home_centre_id', 'email']) {
        await assert.rejects(update('jess', { phone: '+65 8000 0000', [key]: 'changed' }), /Only your phone number and emergency contact/, key)
      }
      assert.deepEqual(await snapshot(students.jess), before)
    })

    await suite.test('only signed-in students with a student record can use it', async () => {
      await assert.rejects(update('newbie', { phone: '+65 8123 4567' }), /not linked to a student record/)
      await assert.rejects(update('ken', { phone: '+65 8123 4567' }), /Sign in as a student/)
      await assert.rejects(as('anon', null, "select public.update_my_student_profile('{\"phone\":\"91234567\"}')"), /permission denied/)
    })

    await suite.test('students still cannot write to the student or contact tables directly', async () => {
      await assert.rejects(as('authenticated', users.jess,
        `update public.students set first_name = 'Hacked' where id = '${students.jess}' returning id`), /permission denied/)
      await assert.rejects(as('authenticated', users.jess,
        `insert into public.emergency_contacts (student_id, name, relationship, phone) values ('${students.kai}', 'X', 'Y', '91234567') returning id`),
        /permission denied/)
    })
  } finally {
    await db.close()
  }
})
