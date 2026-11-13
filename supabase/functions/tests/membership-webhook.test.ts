import assert from 'node:assert/strict'
import { handleRequest } from '../stripe-webhook/handler.ts'
import { cryptoProvider, getStripe } from '../_shared/stripe.ts'

Deno.test('credit webhook deployment preserves membership finalization and failed checkout cleanup', async () => {
  const environment = {
    STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
    STRIPE_WEBHOOK_SECRET: 'whsec_unit_test_only',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'unit_test_service_role',
  }
  const previous = new Map(Object.keys(environment).map((name) => [name, Deno.env.get(name)]))
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value)
  const originalFetch = globalThis.fetch
  const studentId = '00000000-0000-4000-8000-000000000001'
  let finalized = 0
  let deleted = 0
  let amount = 1000
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname === '/v1/checkout/sessions/cs_membership') {
      return Response.json({ id: 'cs_membership', object: 'checkout.session', payment_status: 'paid',
        currency: 'sgd', amount_total: amount, client_reference_id: studentId,
        metadata: { membership_student_id: studentId } })
    }
    if (url.pathname === '/rest/v1/payments') {
      if (request.method === 'DELETE') {
        assert.equal(url.searchParams.get('stripe_session_id'), 'eq.cs_membership')
        assert.equal(url.searchParams.get('status'), 'eq.pending')
        deleted++
        return new Response(null, { status: 204 })
      }
      return Response.json({ student_id: studentId, amount_cents: 1000 })
    }
    if (url.pathname === '/rest/v1/rpc/finalize_membership_checkout') {
      assert.deepEqual(await request.json(), {
        student: studentId, stripe_session: 'cs_membership', paid_amount: 1000, paid_currency: 'sgd',
      })
      finalized++
      return Response.json(null)
    }
    throw new Error(`Unexpected request: ${request.url}`)
  }
  async function signed(type: string) {
    const body = JSON.stringify({ id: 'evt_membership', object: 'event', type, livemode: false,
      data: { object: { id: 'cs_membership', mode: 'payment', payment_status: 'paid',
        metadata: { membership_student_id: studentId } } } })
    const signature = await getStripe().webhooks.generateTestHeaderStringAsync({
      payload: body, secret: environment.STRIPE_WEBHOOK_SECRET, cryptoProvider,
    })
    return new Request('http://localhost', { method: 'POST', body, headers: { 'stripe-signature': signature } })
  }
  try {
    assert.equal((await handleRequest(await signed('checkout.session.completed'))).status, 200)
    assert.equal(finalized, 1)
    amount = 1
    assert.equal((await handleRequest(await signed('checkout.session.completed'))).status, 400)
    assert.equal(finalized, 1)
    assert.equal((await handleRequest(await signed('checkout.session.expired'))).status, 200)
    assert.equal((await handleRequest(await signed('checkout.session.async_payment_failed'))).status, 200)
    assert.equal(deleted, 2)
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})
