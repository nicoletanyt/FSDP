import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/student-credits.ts', import.meta.url), 'utf8')
const { loadStudentCredits, creditLoadErrorMessage } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

function clientFor({ account = { credits: 0, unlimited: false, active: false }, receipt = null, error = null } = {}) {
  const calls = []
  return {
    calls,
    rpc(name) {
      calls.push([name])
      return { async abortSignal() {
        return { data: account ? { unlimited: false, expiring: null, ...account } : account, error }
      } }
    },
    from(table) {
      calls.push([table])
      const query = {
        select() { return query },
        eq(column, value) { calls.at(-1).push([column, value]); return query },
        abortSignal() { return query },
        async maybeSingle() {
          return { data: table === 'credit_accounts' ? account : receipt, error }
        },
      }
      return query
    },
  }
}

const signal = new AbortController().signal

test('confirmed purchase reads receipt before the committed database balance', async () => {
  const client = clientFor({ account: { credits: 35, active: true }, receipt: { stripe_session_id: 'cs_paid' } })
  assert.deepEqual(await loadStudentCredits(client, 'user-one', 'cs_paid', signal), {
    credits: 35, unlimited: false, expiring: null, confirmed: true,
  })
  assert.deepEqual(client.calls, [
    ['credit_purchases', ['user_id', 'user-one'], ['stripe_session_id', 'cs_paid']],
    ['my_credit_summary'],
  ])
})

test('success URL alone does not confirm payment or add credits', async () => {
  const client = clientFor({ account: { credits: 5, active: true } })
  assert.deepEqual(await loadStudentCredits(client, 'user-one', 'cs_pending', signal), {
    credits: 5, unlimited: false, expiring: null, confirmed: false,
  })
})

test('ordinary dashboard load reads the database without needing a checkout session', async () => {
  const client = clientFor({ account: { credits: 50, active: true } })
  assert.equal((await loadStudentCredits(client, 'user-two', null, signal)).credits, 50)
  assert.deepEqual(client.calls, [['my_credit_summary']])
})

test('missing and inactive accounts show zero; unlimited is a database flag', async () => {
  for (const account of [{ credits: 0, unlimited: false, active: false }, { credits: 99, unlimited: true, active: false }]) {
    const result = await loadStudentCredits(clientFor({ account }), 'user', null, signal)
    assert.equal(result.credits, 0)
    assert.equal(result.unlimited, false)
  }
  const result = await loadStudentCredits(clientFor({ account: { credits: 0, unlimited: true, active: true } }), 'user', null, signal)
  assert.equal(result.unlimited, true)
})

test('expiry warnings are sourced from the reconciled batch summary, not invented locally', async () => {
  const expiring = { credits: 4, expiresAt: '2026-12-01T12:00:00Z' }
  const result = await loadStudentCredits(clientFor({ account: { credits: 14, unlimited: false, active: true, expiring } }), 'user', null, signal)
  assert.deepEqual(result.expiring, expiring)
})

test('invalid or missing summaries fail closed instead of claiming a balance', async () => {
  for (const account of [null, { credits: -1, active: true }, { credits: '50', active: true }]) {
    await assert.rejects(loadStudentCredits(clientFor({ account }), 'user', null, signal), /Invalid credit summary/)
  }
})

test('database errors surface rather than substituting a browser-cached balance', async () => {
  await assert.rejects(loadStudentCredits(clientFor({ error: new Error('offline') }), 'user', null, signal), /offline/)
})

test('missing migrations and denied access have actionable, sanitized error messages', () => {
  for (const code of ['PGRST202', 'PGRST205', '42P01', '42883']) {
    assert.match(creditLoadErrorMessage({ code, message: 'private details' }), /add_credit_batches/)
  }
  assert.match(creditLoadErrorMessage({ code: '42501' }), /access was denied/)
  assert.match(creditLoadErrorMessage({ message: 'Student authentication required.' }), /sign in again/)
  assert.equal(creditLoadErrorMessage(new Error('private details')), 'Unable to load your credits. Please try again.')
})
