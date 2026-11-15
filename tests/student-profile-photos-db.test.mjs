import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationsDir = new URL('../supabase/migrations/', import.meta.url)
const users = {
  jess: '00000000-0000-4000-8000-0000000000a1',
  kai: '00000000-0000-4000-8000-0000000000a2',
  newbie: '00000000-0000-4000-8000-0000000000a3', // student account mid-signup: no student record yet
  ken: '00000000-0000-4000-8000-0000000000b1', // instructor
  amy: '00000000-0000-4000-8000-0000000000b2', // administrator
}
const photo = (user, ext = 'jpg') => `${users[user]}/${crypto.randomUUID()}.${ext}`

test('student profile photos (offline PostgreSQL)', async (suite) => {
  const db = new PGlite()

  async function as(who, sql, params = []) {
    await db.exec('begin; set local role authenticated;')
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [users[who] ?? ''])
      const result = await db.query(sql, params)
      await db.exec('commit')
      return result
    } catch (error) {
      await db.exec('rollback')
      throw error
    }
  }
  const upload = (who, name) => as(who, "insert into storage.objects (bucket_id, name) values ('student-photos', $1)", [name])
  const save = (who, expected, next) =>
    as(who, 'select public.save_my_student_photo($1, $2) as r', [expected, next]).then(({ rows }) => rows[0].r)
  const visible = (who) => as(who, "select name from storage.objects where bucket_id = 'student-photos' order by name")
    .then(({ rows }) => rows.map((row) => row.name))
  const storedPath = async (who) =>
    (await db.query('select photo_path from public.students where user_id = $1', [users[who]])).rows[0].photo_path

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

      -- Minimal stand-in for Supabase Storage: buckets plus objects under RLS.
      create schema storage;
      create table storage.buckets (
        id text primary key, name text not null, public boolean not null default false,
        file_size_limit bigint, allowed_mime_types text[]
      );
      create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text references storage.buckets(id), name text not null, unique (bucket_id, name)
      );
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated, anon;
      grant select, insert, delete on storage.objects to authenticated;
    `)
    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql') && f <= '20261102041227_reset_and_domain_schema.sql')
      .sort()
    for (const file of files) await db.exec(await readFile(new URL(file, migrationsDir), 'utf8'))
    await db.exec(await readFile(new URL('20261115062916_student_profile_photos.sql', migrationsDir), 'utf8'))

    const roles = { ken: 'instructor', amy: 'administrator' }
    for (const [key, id] of Object.entries(users)) {
      await db.query('insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3)',
        [id, `${key}@example.test`, JSON.stringify(roles[key] ? { role: roles[key] } : {})])
    }
    await db.exec(`
      insert into public.grades (id, label, sort_order, is_ranked) values ('unranked', 'Unranked', 0, false);
      insert into public.centres (id, name, short_name) values ('00000000-0000-4000-8000-0000000000f1', 'Bishan Dojo', 'BSH');
      insert into public.students (user_id, member_no, first_name, last_name, email, home_centre_id,
          date_of_birth, joined_at, current_grade_id, membership_status) values
        ('${users.jess}', 'M1', 'Jess', 'Tan', 'jess@example.test', '00000000-0000-4000-8000-0000000000f1', '1995-01-01', '2025-01-01', 'unranked', 'active'),
        ('${users.kai}', 'M2', 'Kai', 'Lim', 'kai@example.test', '00000000-0000-4000-8000-0000000000f1', '2012-01-01', '2025-01-01', 'unranked', 'active');
      grant select on all tables in schema public to authenticated;
    `)

    const bucket = (await db.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'student-photos'")).rows[0]
    await suite.test('the bucket is private, 5 MB, images only', () => {
      assert.deepEqual(bucket, { public: false, file_size_limit: 5242880, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] })
    })

    const first = photo('jess')
    await suite.test('a student uploads into their own folder and saves it as their photo', async () => {
      await upload('jess', first)
      assert.deepEqual(await save('jess', null, first), { photo_path: first })
      assert.equal(await storedPath('jess'), first)
    })

    await suite.test('uploads outside your own folder, with odd names, or by staff are refused', async () => {
      await assert.rejects(upload('jess', photo('kai')), /row-level security/)
      await assert.rejects(upload('jess', `${users.jess}/selfie.jpg`), /row-level security/)
      await assert.rejects(upload('jess', photo('jess', 'gif')), /row-level security/)
      await assert.rejects(upload('ken', photo('ken')), /row-level security/)
    })

    await suite.test('during membership signup a student can upload before their record exists', async () => {
      const signupPhoto = photo('newbie')
      await upload('newbie', signupPhoto)
      assert.deepEqual(await visible('newbie'), [signupPhoto])
      // Saving waits until submitting the application has created the record.
      await assert.rejects(save('newbie', null, signupPhoto), /not linked to a student record/)
      await db.exec(`insert into public.students (user_id, member_no, first_name, last_name, email, home_centre_id,
          date_of_birth, joined_at, current_grade_id, membership_status) values
        ('${users.newbie}', 'M3', 'New', 'Bie', 'newbie@example.test', '00000000-0000-4000-8000-0000000000f1',
          '2000-01-01', current_date, 'unranked', 'pending')`)
      assert.deepEqual(await save('newbie', null, signupPhoto), { photo_path: signupPhoto })
    })

    await suite.test('png and webp photos are accepted too', async () => {
      await upload('kai', photo('kai', 'png'))
      await upload('kai', photo('kai', 'webp'))
    })

    await suite.test('saving needs the current photo, an uploaded file, and your own folder', async () => {
      const second = photo('jess', 'webp')
      await upload('jess', second)
      await assert.rejects(save('jess', null, second), /Your photo changed/) // stale: current is `first`
      await assert.rejects(save('jess', first, photo('jess')), /Upload your photo first/) // never uploaded
      const kaiPhoto = (await visible('kai')).find((name) => name.endsWith('.png'))
      await assert.rejects(save('jess', first, kaiPhoto), /Upload your photo first/) // someone else's file
      assert.deepEqual(await save('jess', first, second), { photo_path: second })
      assert.deepEqual(await save('jess', second, null), { photo_path: null }) // remove photo
      assert.equal(await storedPath('jess'), null)
    })

    await suite.test('students see only their own photos; instructors and admins see all', async () => {
      const jessSees = await visible('jess')
      const kaiSees = await visible('kai')
      assert.ok(jessSees.length >= 2 && jessSees.every((name) => name.startsWith(users.jess)))
      assert.ok(kaiSees.length === 2 && kaiSees.every((name) => name.startsWith(users.kai)))
      const newbieSees = await visible('newbie')
      assert.equal((await visible('ken')).length, jessSees.length + kaiSees.length + newbieSees.length)
      assert.equal((await visible('amy')).length, jessSees.length + kaiSees.length + newbieSees.length)
    })

    await suite.test("students can delete only their own photos", async () => {
      const { rows: [kaiFile] } = await db.query(`select name from storage.objects where name like '${users.kai}/%' limit 1`)
      const blocked = await as('jess', 'delete from storage.objects where name = $1 returning name', [kaiFile.name])
      assert.equal(blocked.rows.length, 0)
      const own = await as('kai', 'delete from storage.objects where name = $1 returning name', [kaiFile.name])
      assert.equal(own.rows.length, 1)
    })

    await suite.test('staff and signed-out visitors cannot use the save function', async () => {
      await assert.rejects(save('ken', null, null), /Sign in as a student/)
      await db.exec('begin; set local role anon;')
      try {
        await assert.rejects(db.query('select public.save_my_student_photo(null, null)'), /permission denied/)
      } finally {
        await db.exec('rollback')
      }
    })
  } finally {
    await db.close()
  }
})
