import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('credit checkout adds 10 to 20, deduplicates receipts, and restricts writes to the server', async () => {
  const db = new PGlite()
  const user = '00000000-0000-4000-8000-000000000001'
  const other = '00000000-0000-4000-8000-000000000002'
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      grant usage on schema auth, public to authenticated, service_role;
      create table auth.users (id uuid primary key);
      create table public.users (id uuid primary key references auth.users(id), role text not null);
      create table public.students (id uuid primary key, user_id uuid unique references public.users(id));
      create table public.payments (
        student_id uuid, item text, description text, amount_cents integer, currency text,
        status text, stripe_session_id text unique, paid_at timestamptz
      );
      create function public.is_administrator() returns boolean language sql stable as $$ select false; $$;
      insert into auth.users values ('${user}'), ('${other}');
      insert into public.users values ('${user}', 'student'), ('${other}', 'student');
      insert into public.students values ('${user}', '${user}');
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261113120000_credit_checkout.sql', import.meta.url), 'utf8'))
    await db.query('insert into public.credit_accounts(user_id, credits) values ($1,20)', [user])
    async function finalize(session) {
      await db.query(`select public.finalize_credit_checkout($1,$2,'adult-10','10 Session Pass',10,false,'adult',27000,'sgd')`, [user, session])
    }
    await finalize('cs_paid_one')
    assert.equal((await db.query('select credits from public.credit_accounts')).rows[0].credits, 30)
    await Promise.all([finalize('cs_paid_one'), finalize('cs_paid_one')])
    assert.equal((await db.query('select credits from public.credit_accounts')).rows[0].credits, 30)
    await finalize('cs_paid_two')
    assert.equal((await db.query('select credits from public.credit_accounts')).rows[0].credits, 40)
    assert.equal((await db.query('select count(*)::int as count from public.credit_purchases')).rows[0].count, 2)
    assert.equal((await db.query('select count(*)::int as count from public.payments')).rows[0].count, 2)

    for (const account of [user, other]) {
      await db.exec('begin; set local role authenticated;')
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [account])
      assert.equal((await db.query('select * from public.credit_accounts')).rows.length, account === user ? 1 : 0)
      assert.equal((await db.query('select * from public.credit_purchases')).rows.length, account === user ? 2 : 0)
      await assert.rejects(finalize('cs_browser_forgery'), /permission denied/)
      await db.exec('rollback')
    }
    await db.exec('begin; set local role authenticated;')
    await assert.rejects(db.query('update public.credit_accounts set credits = 99999'), /permission denied/)
    await db.exec('rollback')
  } finally {
    await db.close()
  }
})
