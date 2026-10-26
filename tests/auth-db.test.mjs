import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('Auth profile migration and RLS (offline PostgreSQL)', async (suite) => {
  const db = new PGlite()
  const ids = {
    administrator: '00000000-0000-4000-8000-000000000001',
    instructor: '00000000-0000-4000-8000-000000000002',
    student: '00000000-0000-4000-8000-000000000003',
    other: '00000000-0000-4000-8000-000000000004',
    existing: '00000000-0000-4000-8000-000000000005',
  }

  async function asRole(role, userId, query) {
    await db.exec(`begin; set local role ${role};`)
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ''])
      return await query()
    } finally {
      await db.exec('rollback')
    }
  }

  try {
    // Emulate Supabase's built-in roles and the Auth columns used by the migration.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}',
        raw_app_meta_data jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
    `)
    await db.query(`
      insert into auth.users (id, email, raw_user_meta_data)
      values ($1, 'existing@example.test', '{"role":"administrator"}');
    `, [ids.existing])

    const migration = await readFile(
      new URL('../supabase/migrations/20261026120000_auth_roles.sql', import.meta.url), 'utf8',
    )
    await db.exec(migration)
    await db.exec(await readFile(
      new URL('../supabase/migrations/20261026130000_sync_trusted_roles.sql', import.meta.url), 'utf8',
    ))

    for (const role of ['administrator', 'instructor', 'student', 'other']) {
      await db.query(`
        insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
        values ($1, $2, $3, $4);
      `, [
        ids[role], `${role}@example.test`,
        JSON.stringify({ first_name: 'Test', last_name: role, role: 'administrator' }),
        JSON.stringify(role === 'administrator' || role === 'instructor' ? { role } : {}),
      ])
    }

    await suite.test('new and existing public signups ignore user-supplied roles', async () => {
      const { rows } = await db.query(
        'select role from public.users where id = any($1::uuid[])',
        [[ids.student, ids.other, ids.existing]],
      )
      assert.equal(rows.length, 3)
      assert.ok(rows.every((row) => row.role === 'student'))
    })

    await suite.test('trusted provisioning assigns administrator and instructor roles', async () => {
      for (const role of ['administrator', 'instructor']) {
        const { rows } = await db.query('select role from public.users where id = $1', [ids[role]])
        assert.equal(rows[0].role, role)
      }
    })

    await suite.test('trusted role metadata applied after insertion promotes and demotes correctly', async () => {
      await db.query(`update auth.users set raw_app_meta_data = '{"role":"instructor"}' where id = $1`, [ids.other])
      let result = await db.query('select role from public.users where id = $1', [ids.other])
      assert.equal(result.rows[0].role, 'instructor')
      await db.query(`update auth.users set raw_app_meta_data = '{}' where id = $1`, [ids.other])
      result = await db.query('select role from public.users where id = $1', [ids.other])
      assert.equal(result.rows[0].role, 'student')
    })

    await suite.test('students and instructors can read only their own profiles', async () => {
      for (const role of ['student', 'instructor']) {
        const result = await asRole('authenticated', ids[role], () => db.query('select id from public.users'))
        assert.deepEqual(result.rows.map((row) => row.id), [ids[role]])
      }
    })

    await suite.test('administrators can read all profiles without recursive RLS', async () => {
      const result = await asRole('authenticated', ids.administrator, () => db.query('select id from public.users'))
      assert.equal(result.rows.length, 5)
    })

    await suite.test('no authenticated role can insert, update, or delete profiles', async () => {
      for (const role of ['student', 'instructor', 'administrator']) {
        for (const sql of [
          "update public.users set role = 'administrator'",
          'delete from public.users',
          `insert into public.users (id, email, role) values ('${ids.student}', 'test@example.test', 'administrator')`,
        ]) {
          await assert.rejects(
            () => asRole('authenticated', ids[role], () => db.exec(sql)),
            (error) => error.code === '42501',
          )
        }
      }
    })

    await suite.test('anonymous callers cannot read profiles or invoke the role helper', async () => {
      for (const sql of ['select * from public.users', 'select public.current_user_role()']) {
        await assert.rejects(
          () => asRole('anon', null, () => db.exec(sql)),
          (error) => error.code === '42501',
        )
      }
    })

    await suite.test('changing user metadata never changes a role; Auth email updates are synchronized', async () => {
      await db.query(`
        update auth.users set raw_user_meta_data = '{"role":"administrator"}',
          email = 'updated@example.test' where id = $1;
      `, [ids.student])
      const { rows } = await db.query('select role, email from public.users where id = $1', [ids.student])
      assert.deepEqual(rows[0], { role: 'student', email: 'updated@example.test' })
    })

    await suite.test('profiles contain no password column and are removed with Auth accounts', async () => {
      const { rows } = await db.query(`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'users' order by ordinal_position;
      `)
      assert.deepEqual(rows.map((row) => row.column_name), [
        'id', 'first_name', 'last_name', 'email', 'role', 'created_at',
      ])
      await db.query('delete from auth.users where id = $1', [ids.other])
      const remaining = await db.query('select id from public.users where id = $1', [ids.other])
      assert.equal(remaining.rows.length, 0)
    })
  } finally {
    await db.close()
  }
})
