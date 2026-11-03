import assert from 'node:assert/strict'
import { handleRequest as invitation } from '../send-grading-invitation/handler.ts'
import { handleRequest as checkout } from '../create-grading-checkout/handler.ts'
import { handleRequest as webhook } from '../stripe-webhook/handler.ts'
import { cryptoProvider, getStripe } from '../_shared/stripe.ts'

Deno.test('grading functions reject unauthorized requests before any external send or charge', async () => {
  const before = Deno.env.get('APP_URL')
  const originalFetch = globalThis.fetch
  let calls = 0
  Deno.env.set('APP_URL', 'http://localhost:5173')
  globalThis.fetch = () => { calls++; throw new Error('External request must not occur') }
  try {
    for (const handler of [invitation, checkout]) {
      assert.equal((await handler(new Request('http://localhost', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }))).status, 204)
      assert.equal((await handler(new Request('http://localhost', { method: 'POST', headers: { origin: 'https://attacker.test' } }))).status, 403)
      assert.equal((await handler(new Request('http://localhost', { method: 'POST', headers: { origin: 'http://localhost:5173' }, body: '{}' }))).status, 403)
    }
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch
    if (before === undefined) Deno.env.delete('APP_URL')
    else Deno.env.set('APP_URL', before)
  }
})

Deno.test('verified paid grading session finalizes once per webhook delivery; unpaid and mismatched sessions do not', async () => {
  const names = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
  const previous = names.map((name) => Deno.env.get(name))
  const values = ['sk_test_unit_test_only', 'whsec_unit_test_only', 'https://example.supabase.co', 'unit_test_service_role']
  names.forEach((name, index) => Deno.env.set(name, values[index]))
  const originalFetch = globalThis.fetch
  let finalized = 0
  let amount = 6000
  const attempt = '00000000-0000-4000-8000-000000000001'
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.url.startsWith('https://api.stripe.com/v1/checkout/sessions/')) {
      return Response.json({ id: 'cs_test_grading', object: 'checkout.session', mode: 'payment',
        payment_status: 'paid', amount_total: amount, currency: 'sgd', metadata: { grading_attempt_id: attempt } })
    }
    if (request.url.includes('/rest/v1/rpc/finalize_grading_checkout')) {
      finalized++
      const payload = await request.json()
      assert.equal(payload.attempt, attempt)
      assert.equal(payload.stripe_session, 'cs_test_grading')
      return Response.json(null)
    }
    throw new Error(`Unexpected external request: ${request.url}`)
  }
  async function signed(paid: boolean) {
    const body = JSON.stringify({ id: 'evt_grading', object: 'event', type: 'checkout.session.completed', livemode: false,
      data: { object: { id: 'cs_test_grading', mode: 'payment', payment_status: paid ? 'paid' : 'unpaid',
        metadata: { grading_attempt_id: attempt } } } })
    const signature = await getStripe().webhooks.generateTestHeaderStringAsync({ payload: body,
      secret: values[1], cryptoProvider })
    return new Request('http://localhost', { method: 'POST', body, headers: { 'stripe-signature': signature } })
  }
  try {
    assert.equal((await webhook(await signed(false))).status, 200)
    assert.equal(finalized, 0)
    amount = 5000
    assert.equal((await webhook(await signed(true))).status, 400)
    assert.equal(finalized, 0)
    amount = 6000
    assert.equal((await webhook(await signed(true))).status, 200)
    assert.equal((await webhook(await signed(true))).status, 200)
    assert.equal(finalized, 2) // DB RPC locks and deduplicates on the attempt row.
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => previous[index] === undefined ? Deno.env.delete(name) : Deno.env.set(name, previous[index]!))
  }
})
