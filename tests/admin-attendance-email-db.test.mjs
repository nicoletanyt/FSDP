import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('attendance send history is admin-only and weekly reservations prevent duplicate sends', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.users(id uuid primary key, role text);
      create table public.students(id uuid primary key);
      create function public.is_administrator() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.users where id=auth.uid() and role='administrator') $$;
      grant usage on schema public,auth to authenticated;
      grant execute on function auth.uid(),public.is_administrator() to authenticated;
    `)
    await db.query("insert into public.users values ($1,'administrator'),($2,'student')", [id(1), id(2)])
    await db.query('insert into public.students values ($1)', [id(3)])
    await db.exec(await readFile(new URL('../supabase/migrations/20261111083948_admin_attendance_email_sends.sql', import.meta.url), 'utf8'))
    await db.query('insert into public.admin_attendance_email_sends(student_id,requested_by,week_start) values($1,$2,$3)', [id(3), id(1), '2026-11-09'])
    await assert.rejects(() => db.query('insert into public.admin_attendance_email_sends(student_id,requested_by,week_start) values($1,$2,$3)', [id(3), id(1), '2026-11-09']), /attendance_email_one_per_student_week/)
    await db.query("update public.admin_attendance_email_sends set status='failed'")
    await db.query('insert into public.admin_attendance_email_sends(student_id,requested_by,week_start) values($1,$2,$3)', [id(3), id(1), '2026-11-09'])
    assert.equal((await db.query("select has_table_privilege('anon','public.admin_attendance_email_sends','SELECT') allowed")).rows[0].allowed, false)
    await db.exec(`set request.jwt.claim.sub='${id(2)}'; set role authenticated`)
    assert.equal((await db.query('select count(*)::int total from public.admin_attendance_email_sends')).rows[0].total, 0)
    await assert.rejects(() => db.query("update public.admin_attendance_email_sends set status='accepted'"), /permission denied/)
    await db.exec(`reset role; set request.jwt.claim.sub='${id(1)}'; set role authenticated`)
    assert.equal((await db.query('select count(*)::int total from public.admin_attendance_email_sends')).rows[0].total, 2)
  } finally { await db.close() }
})
