import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/student-credits.ts', import.meta.url), 'utf8')
const { loadStudentCredits } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

function clientFor({ account = null, receipt = null, error = null } = {}) {
  const calls = []
  return {
    calls,
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
    credits: 35, unlimited: false, confirmed: true,
  })
  assert.deepEqual(client.calls, [
    ['credit_purchases', ['user_id', 'user-one'], ['stripe_session_id', 'cs_paid']],
    ['credit_accounts', ['user_id', 'user-one']],
  ])
})

test('success URL alone does not confirm payment or add credits', async () => {
  const client = clientFor({ account: { credits: 5, active: true } })
  assert.deepEqual(await loadStudentCredits(client, 'user-one', 'cs_pending', signal), {
    credits: 5, unlimited: false, confirmed: false,
  })
})

test('ordinary dashboard load reads the database without needing a checkout session', async () => {
  const client = clientFor({ account: { credits: 50, active: true } })
  assert.equal((await loadStudentCredits(client, 'user-two', null, signal)).credits, 50)
  assert.deepEqual(client.calls, [['credit_accounts', ['user_id', 'user-two']]])
})

test('missing and inactive accounts show zero; unlimited is a database flag', async () => {
  for (const account of [null, { credits: 99, unlimited: true, active: false }]) {
    const result = await loadStudentCredits(clientFor({ account }), 'user', null, signal)
    assert.equal(result.credits, 0)
    assert.equal(result.unlimited, false)
  }
  const result = await loadStudentCredits(clientFor({ account: { credits: 0, unlimited: true, active: true } }), 'user', null, signal)
  assert.equal(result.unlimited, true)
})

test('database errors surface rather than substituting a browser-cached balance', async () => {
  await assert.rejects(loadStudentCredits(clientFor({ error: new Error('offline') }), 'user', null, signal), /offline/)
})
