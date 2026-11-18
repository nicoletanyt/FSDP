import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('a failed invitation has only one retry receipt and preserves the original rejection', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      create table public.class_cover_test_invitations (id uuid primary key);
      insert into public.class_cover_test_invitations values ('00000000-0000-4000-8000-000000000001');
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261119173000_cover_invitation_single_retry_audit.sql', import.meta.url), 'utf8'))
    await db.exec("insert into public.class_cover_invitation_retry_audit(invitation_id,original_provider_http_status,original_failure_reason) values ('00000000-0000-4000-8000-000000000001',422,'Original rejection')")
    await assert.rejects(() => db.exec("insert into public.class_cover_invitation_retry_audit(invitation_id,original_provider_http_status) values ('00000000-0000-4000-8000-000000000001',403)"), /duplicate key/)
    const { rows } = await db.query('select original_provider_http_status,original_failure_reason,status from public.class_cover_invitation_retry_audit')
    assert.deepEqual(rows, [{ original_provider_http_status: 422, original_failure_reason: 'Original rejection', status: 'sending' }])
  } finally { await db.close() }
})
