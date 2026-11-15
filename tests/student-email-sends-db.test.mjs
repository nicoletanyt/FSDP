import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('student email reservations are server-only and backfill past payments', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create table public.students (id uuid primary key, member_no text not null);
      create table public.payments (student_id uuid not null, item text not null, status text not null);
      create table public.credit_purchases (stripe_session_id text primary key);
      insert into public.students values ('00000000-0000-4000-8000-000000000001', 'ASJ123');
      insert into public.payments values ('00000000-0000-4000-8000-000000000001', 'Membership', 'paid');
      insert into public.credit_purchases values ('cs_old_credit');
    `)
    const sql = await readFile(new URL('../supabase/migrations/20261115120000_student_email_sends.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    const { rows } = await db.query('select send_key, status from public.student_email_sends order by send_key')
    assert.deepEqual(rows, [
      { send_key: 'credit-receipt/cs_old_credit/v1', status: 'legacy' },
      { send_key: 'membership-paid/00000000-0000-4000-8000-000000000001/ASJ123/v1', status: 'legacy' },
    ])
    await assert.rejects(db.exec(`set role authenticated; insert into public.student_email_sends(send_key) values ('forged');`),
      error => error.code === '42501')
    await db.exec('reset role')
    await assert.rejects(db.exec(`set role anon; select * from public.student_email_sends;`),
      error => error.code === '42501')
    await db.exec('reset role')
    const { rows: inserted } = await db.query(`insert into public.student_email_sends(send_key)
      values ('credit-receipt/cs_new/v1') on conflict do nothing returning send_key`)
    assert.equal(inserted.length, 1)
    const { rows: duplicate } = await db.query(`insert into public.student_email_sends(send_key)
      values ('credit-receipt/cs_new/v1') on conflict do nothing returning send_key`)
    assert.equal(duplicate.length, 0)
  } finally {
    await db.close()
  }
})
