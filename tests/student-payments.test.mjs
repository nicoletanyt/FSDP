import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/student-payments.ts', import.meta.url), 'utf8')
const { loadStudentPayments } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)
const signal = new AbortController().signal

function clientFor({ payments = [], credit_purchases = [], errorTable } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      const call = { table, filters: [], orders: [] }
      calls.push(call)
      const query = {
        select() { return query },
        eq(column, value) { call.filters.push([column, value]); return query },
        order(column) { call.orders.push(column); return query },
        range(start, end) { call.range = [start, end]; return query },
        async abortSignal(value) {
          assert.equal(value, signal)
          return { data: ({ payments, credit_purchases })[table].slice(call.range[0], call.range[1] + 1), error: errorTable === table ? new Error('offline') : null }
        },
      }
      return query
    },
  }
}

const purchase = {
  stripe_session_id: 'cs_topup', pass_title: '25 Session Pass',
  amount_cents: 60000, created_at: '2026-11-14T10:00:00Z',
}
const payment = {
  id: 'payment-one', stripe_session_id: 'cs_topup', item: 'Class pass',
  description: '25 Session Pass', amount_cents: 60000, method: 'Stripe', status: 'paid',
  paid_at: '2026-11-14T10:00:00Z', created_at: '2026-11-14T09:59:00Z',
}

test('a confirmed top-up appears even without a linked student payment row', async () => {
  const client = clientFor({ credit_purchases: [purchase] })
  assert.deepEqual(await loadStudentPayments(client, 'user-one', signal), [{
    id: 'credit:cs_topup', date: purchase.created_at, item: 'Class pass',
    description: '25 Session Pass', amount: 600, method: 'Stripe', status: 'Paid',
  }])
  assert.deepEqual(client.calls.map(({ table, filters }) => [table, filters]), [
    ['payments', [['students.user_id', 'user-one'], ['currency', 'sgd']]],
    ['credit_purchases', [['user_id', 'user-one'], ['currency', 'sgd']]],
  ])
})

test('top-up is counted once and the payment row preserves refund status', async () => {
  for (const status of ['paid', 'refunded']) {
    const rows = await loadStudentPayments(clientFor({
      payments: [{ ...payment, status }], credit_purchases: [purchase],
    }), 'user-one', signal)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].id, 'payment-one')
    assert.equal(rows[0].status, status === 'paid' ? 'Paid' : 'Refunded')
    assert.equal(rows[0].date, payment.paid_at)
  }
})

test('membership and pending payments are retained and ordered newest first', async () => {
  const rows = await loadStudentPayments(clientFor({
    payments: [{ ...payment, stripe_session_id: 'cs_member', item: 'Membership', status: 'pending', paid_at: null }],
    credit_purchases: [purchase],
  }), 'user-one', signal)
  assert.deepEqual(rows.map((row) => [row.item, row.status]), [['Class pass', 'Paid'], ['Membership', 'Pending']])
})

test('empty history stays empty instead of showing sample payments', async () => {
  assert.deepEqual(await loadStudentPayments(clientFor(), 'user-one', signal), [])
})

test('read failures surface rather than presenting incomplete history', async () => {
  for (const errorTable of ['payments', 'credit_purchases']) {
    await assert.rejects(loadStudentPayments(clientFor({ errorTable }), 'user-one', signal), /offline/)
  }
})

test('all payment and purchase pages are read, not just the API first page', async () => {
  const client = clientFor({
    payments: Array.from({ length: 501 }, (_, i) => ({ ...payment, id: `p${i}`, stripe_session_id: `cs_p${i}` })),
    credit_purchases: Array.from({ length: 501 }, (_, i) => ({ ...purchase, stripe_session_id: `cs_c${i}` })),
  })
  assert.equal((await loadStudentPayments(client, 'user-one', signal)).length, 1002)
  assert.deepEqual(client.calls.map(({ range }) => range), [[0, 499], [500, 999], [0, 499], [500, 999]])
})
