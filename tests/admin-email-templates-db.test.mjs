import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const admin = '00000000-0000-4000-8000-000000000001'
const student = '00000000-0000-4000-8000-000000000002'

test('fixed email templates preserve grading wording and allow only administrators to edit', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.users (id uuid primary key, role text);
      create function public.is_administrator() returns boolean language sql stable security definer as $$
        select exists(select 1 from public.users where id=auth.uid() and role='administrator') $$;
      create table public.grading_invitation_settings (
        id boolean primary key, subject text not null, body text not null, updated_at timestamptz not null);
      grant usage on schema public,auth to authenticated;
      grant execute on function auth.uid(),public.is_administrator() to authenticated;
    `)
    const body = `Dear Student\n{{children_grading_date}} {{children_application_close_date}}\n{{adult_grading_date}} {{adult_application_close_date}}\nhttps://fsdp-kappa.vercel.app/grading`
    await db.query('insert into public.grading_invitation_settings values (true,$1,$2,now())', ['Saved subject', body])
    await db.query('insert into public.users values ($1,$2),($3,$4)', [admin, 'administrator', student, 'student'])
    await db.exec(await readFile(new URL('../supabase/migrations/20261111083437_admin_email_templates.sql', import.meta.url), 'utf8'))
    const rows = (await db.query('select id,subject,body from public.admin_email_templates order by id')).rows
    assert.deepEqual(rows.map(row => row.id), ['attendance_notice', 'grading_invitation'])
    assert.equal(rows[1].body, body)
    assert.equal(rows[1].subject, 'Saved subject')
    assert.equal((await db.query("select has_table_privilege('anon','public.admin_email_templates','SELECT') allowed")).rows[0].allowed, false)
    await db.exec(`set request.jwt.claim.sub='${student}'; set role authenticated`)
    assert.equal((await db.query('select count(*)::int as total from public.admin_email_templates')).rows[0].total, 0)
    await db.query("update public.admin_email_templates set subject='No access' where id='attendance_notice'")
    await assert.rejects(() => db.query("insert into public.admin_email_templates values ('other','Subject','Message')"), /permission denied/)
    await db.exec(`reset role; set request.jwt.claim.sub='${admin}'; set role authenticated`)
    assert.equal((await db.query('select count(*)::int as total from public.admin_email_templates')).rows[0].total, 2)
    await db.query("update public.admin_email_templates set subject='Check-in' where id='attendance_notice'")
    await assert.rejects(() => db.query("update public.admin_email_templates set body='Missing placeholders' where id='attendance_notice'"), /template_placeholders_check/)
    await assert.rejects(() => db.query("update public.admin_email_templates set body=body || '{{unrecognized}}' where id='grading_invitation'"), /template_placeholders_check/)
  } finally { await db.close() }
})
