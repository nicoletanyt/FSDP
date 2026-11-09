import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

test('only the assigned instructor can report a future class; retries are idempotent and admin can read', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated nologin;
      create role anon nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.users(id uuid primary key, role text not null);
      create table public.instructors(id uuid primary key, user_id uuid unique references public.users(id));
      create table public.events(id uuid primary key, instructor_id uuid references public.instructors(id),
        event_type text not null, status text not null, starts_at timestamptz, ends_at timestamptz);
      create function public.is_administrator() returns boolean language sql stable security definer as $$
        select exists (select 1 from public.users where id=auth.uid() and role='administrator') $$;
      create function public.current_user_role() returns text language sql stable security definer as $$
        select role from public.users where id=auth.uid() $$;
      grant usage on schema public, auth to authenticated;
      grant execute on function auth.uid() to authenticated;
    `)
    const migration = await readFile(new URL('../supabase/migrations/20261108105022_instructor_class_unavailability.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    const followUp = await readFile(new URL('../supabase/migrations/20261108105241_class_unavailability_policy_index.sql', import.meta.url), 'utf8')
    await db.exec(followUp)
    const diagnostics = await readFile(new URL('../supabase/migrations/20261108120548_class_unavailability_email_diagnostics.sql', import.meta.url), 'utf8')
    await db.exec(diagnostics)
    await db.query("insert into public.users values ($1,'instructor'),($2,'instructor'),($3,'administrator')", [id(1), id(2), id(3)])
    await db.query('insert into public.instructors values ($1,$2),($3,$4)', [id(4), id(1), id(5), id(2)])
    await db.query("insert into public.events values ($1,$2,'class','scheduled',now()+interval '1 day',now()+interval '1 day 1 hour'),($3,$2,'class','scheduled',now()-interval '2 hours',now()-interval '1 hour'),($4,$2,'grading','scheduled',now()+interval '1 day',now()+interval '1 day 1 hour'),($5,$6,'class','scheduled',now()+interval '1 day',now()+interval '1 day 1 hour')", [id(6), id(4), id(7), id(8), id(9), id(5)])
    await db.exec(`set request.jwt.claim.sub='${id(2)}'; set role authenticated;`)
    await assert.rejects(() => db.query('select public.report_instructor_class_unavailability($1)', [id(6)]), /Assigned class not found/)
    await db.exec(`reset role; set request.jwt.claim.sub='${id(1)}'; set role authenticated;`)
    await assert.rejects(() => db.query('select public.report_instructor_class_unavailability($1)', [id(7)]), /Only future scheduled classes/)
    await assert.rejects(() => db.query('select public.report_instructor_class_unavailability($1)', [id(8)]), /Assigned class not found/)
    const { rows: [first] } = await db.query('select (public.report_instructor_class_unavailability($1)).id as id', [id(6)])
    const { rows: [retry] } = await db.query('select (public.report_instructor_class_unavailability($1)).id as id', [id(6)])
    assert.equal(first.id, retry.id)
    const { rows: [legacy] } = await db.query('select notification_http_status,notification_failure_reason from public.instructor_class_unavailability where id=$1', [first.id])
    assert.deepEqual(legacy, { notification_http_status: null, notification_failure_reason: null })
    await assert.rejects(() => db.query('update public.instructor_class_unavailability set notification_status=$1', ['accepted']), /permission denied/)
    await db.exec(`reset role; set request.jwt.claim.sub='${id(3)}'; set role authenticated;`)
    const { rows } = await db.query('select event_id,notification_status from public.instructor_class_unavailability')
    assert.deepEqual(rows, [{ event_id: id(6), notification_status: 'pending' }])
  } finally {
    await db.close()
  }
})
