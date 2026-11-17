import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationsDir = new URL('../supabase/migrations/', import.meta.url)

test('a key fob bought with the membership is flagged until a tag is issued (offline PostgreSQL)', async () => {
  const db = new PGlite()
  const centre = '00000000-0000-4000-8000-0000000000c1'
  const withFob = '00000000-0000-4000-8000-0000000000b1'
  const withoutFob = '00000000-0000-4000-8000-0000000000b2'
  const tag = 'a'.repeat(64)
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text,
        raw_user_meta_data jsonb not null default '{}', raw_app_meta_data jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
    `)
    const files = (await readdir(migrationsDir)).filter(f => f.endsWith('.sql'))
      .filter(f => f <= '20261102041227_reset_and_domain_schema.sql' ||
        f.includes('membership_checkout') || f.includes('student_payments'))
      .sort()
    for (const file of files) await db.exec(await readFile(new URL(file, migrationsDir), 'utf8'))
    // Only the tag table from the NFC migration (its RPCs need the class schedule).
    const nfc = await readFile(new URL('20261106132832_student_nfc_attendance.sql', migrationsDir), 'utf8')
    await db.exec(nfc.match(/create table public\.student_nfc_tags \([\s\S]*?\n\);/)[0])
    const keyFob = await readFile(new URL('20261116144113_membership_key_fob.sql', migrationsDir), 'utf8')
    await db.exec(keyFob)
    await db.exec(keyFob) // safe to re-run

    await db.query("insert into public.centres (id, name, short_name) values ($1, 'Dojo', 'DJ')", [centre])
    await db.query("insert into public.grades (id, label, is_ranked, sort_order) values ('unranked', 'Unranked', false, 0)")
    for (const [id, n] of [[withFob, 1], [withoutFob, 2]]) {
      await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `student${n}@example.test`])
      await db.query(`insert into public.students (id, user_id, member_no, first_name, last_name, email, home_centre_id,
        date_of_birth, joined_at, membership_status) values ($1, $1, $2, 'Test', 'Student', $3, $4, '2000-01-01', current_date, 'pending')`,
      [id, `ASJ000${n}`, `student${n}@example.test`, centre])
    }
    const finalize = (student, session, amount, fob) => db.query(
      'select public.finalize_membership_checkout($1, $2, $3, $4, $5)', [student, session, amount, 'SGD', fob])
    const fob = async student => (await db.query(
      'select key_fob_status, key_fob_ordered_at from public.students where id = $1', [student])).rows[0]
    const payment = async session => (await db.query(
      'select description, amount_cents, status from public.payments where stripe_session_id = $1', [session])).rows[0]

    // Paid with a fob: active, ordered, one payment row for the total.
    await finalize(withFob, 'cs_fob', 6200, true)
    const ordered = await fob(withFob)
    assert.equal(ordered.key_fob_status, 'ordered')
    assert.ok(ordered.key_fob_ordered_at)
    assert.deepEqual(await payment('cs_fob'), { description: 'Membership fee + key fob', amount_cents: 6200, status: 'paid' })
    assert.equal((await db.query('select membership_status from public.students where id = $1', [withFob])).rows[0].membership_status, 'active')

    // A webhook retry keeps the first order time.
    await finalize(withFob, 'cs_fob', 6200, true)
    assert.deepEqual(await fob(withFob), ordered)

    // Issuing a tag (scripts/nfc-tags.mjs) fulfils the order.
    await db.query('insert into public.student_nfc_tags (student_id, tag_id) values ($1, $2)', [withFob, tag])
    assert.equal((await fob(withFob)).key_fob_status, 'issued')
    // A later fob payment never resets an issued fob.
    await finalize(withFob, 'cs_fob_again', 6200, true)
    assert.equal((await fob(withFob)).key_fob_status, 'issued')

    // Without a fob (old 4-argument callers default to false): nothing ordered.
    await db.query('select public.finalize_membership_checkout($1, $2, $3, $4)', [withoutFob, 'cs_plain', 6000, 'sgd'])
    assert.deepEqual(await fob(withoutFob), { key_fob_status: null, key_fob_ordered_at: null })
    assert.equal((await payment('cs_plain')).description, 'Membership fee')
    // A tag issued to someone who didn't order one leaves them "not ordered".
    await db.query('insert into public.student_nfc_tags (student_id, tag_id) values ($1, $2)', [withoutFob, 'b'.repeat(64)])
    assert.equal((await fob(withoutFob)).key_fob_status, null)

    // Only the service role may finalize.
    await db.exec('begin; set local role authenticated;')
    await assert.rejects(finalize(withoutFob, 'cs_x', 6200, true), /permission denied/)
    await db.exec('rollback')
  } finally {
    await db.close()
  }
})
