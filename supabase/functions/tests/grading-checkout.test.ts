import assert from 'node:assert/strict'
import { handleRequest } from '../create-grading-checkout/handler.ts'

Deno.test('grading Stripe Checkout uses the database quote including the S$22 late fee', async (test) => {
  const environment = {
    APP_URL: 'http://localhost:5173', SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test_anon', SUPABASE_SERVICE_ROLE_KEY: 'test_service', STRIPE_SECRET_KEY: 'sk_test_unit_test',
  }
  const before = new Map(Object.keys(environment).map((name) => [name, Deno.env.get(name)]))
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value)
  const originalFetch = globalThis.fetch
  const event = '00000000-0000-4000-8000-000000000001'
  const attemptId = '00000000-0000-4000-8000-000000000002'
  const userId = '00000000-0000-4000-8000-000000000003'
  let storedSession: string | null = null
  let sessionStatus = 'open'
  let paymentStatus = 'unpaid'
  let revision = 0
  let amount = 7700
  let eligible = true
  const stripeCreates: URLSearchParams[] = []
  const keys: (string | null)[] = []
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname === '/auth/v1/user') return Response.json({ id: userId })
    if (url.pathname === '/rest/v1/users') return Response.json({ role: 'student' })
    if (url.pathname === '/rest/v1/rpc/reserve_grading_checkout') {
      assert.deepEqual(await request.json(), { target_event: event, auth_user: userId })
      return Response.json(eligible ? [{ attempt_id: attemptId, checkout_session: storedSession, target_grade: '5-kyu',
        revision, amount, base_amount: 5500, late_amount: amount - 5500, deadline: '2026-11-10' }] : [])
    }
    if (url.pathname === '/rest/v1/rpc/retry_grading_checkout') {
      storedSession = null
      revision++
      return Response.json(revision)
    }
    if (url.pathname === '/rest/v1/grades') return Response.json({ label: '5th Kyu' })
    if (url.pathname === '/rest/v1/grading_checkout_attempts') {
      if (request.method === 'PATCH') {
        assert.equal(url.searchParams.get('amount_cents'), `eq.${amount}`)
        storedSession = (await request.json()).stripe_session_id
        return Response.json({ id: attemptId })
      }
      assert.equal(url.searchParams.get('students.user_id'), `eq.${userId}`)
      return Response.json({ status: paymentStatus === 'paid' ? 'paid' : 'pending' })
    }
    if (url.pathname === '/v1/checkout/sessions' && request.method === 'POST') {
      stripeCreates.push(new URLSearchParams(await request.text()))
      keys.push(request.headers.get('idempotency-key'))
      return Response.json({ id: 'cs_test_grading', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/grading' })
    }
    if (url.pathname === '/v1/checkout/sessions/cs_test_grading') {
      return Response.json({ id: 'cs_test_grading', object: 'checkout.session', status: sessionStatus,
        payment_status: paymentStatus, amount_total: amount, currency: 'sgd', url: 'https://checkout.stripe.com/c/pay/grading' })
    }
    throw new Error(`Unexpected request: ${request.url}`)
  }
  const request = (body: object) => new Request('http://localhost', {
    method: 'POST', headers: { origin: environment.APP_URL, authorization: 'Bearer student_token', 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const selection = { event_id: event, target_grade_id: '5-kyu' }
  try {
    await test.step('quote returns 55 + 22 = 77 without creating a Stripe session', async () => {
      const response = await handleRequest(request({ ...selection, action: 'quote' }))
      assert.equal(response.status, 200)
      const { quote } = await response.json()
      assert.equal(quote.baseFeeCents, 5500)
      assert.equal(quote.lateFeeCents, 2200)
      assert.equal(quote.totalCents, 7700)
      assert.equal(stripeCreates.length, 0)
    })
    await test.step('a stale $55 review cannot silently create a different charge', async () => {
      const response = await handleRequest(request({ ...selection, action: 'checkout', expected_amount: 5500, amount: 5500 }))
      assert.equal(response.status, 409)
      assert.equal((await response.json()).quote.totalCents, 7700)
      assert.equal(stripeCreates.length, 0)
    })
    await test.step('Stripe receives exactly $77 as separate base and late line items', async () => {
      const response = await handleRequest(request({ ...selection, action: 'checkout', expected_amount: 7700 }))
      assert.equal(response.status, 200)
      const body = stripeCreates[0]
      assert.equal(body.get('mode'), 'payment')
      assert.equal(body.get('line_items[0][price_data][unit_amount]'), '5500')
      assert.equal(body.get('line_items[1][price_data][unit_amount]'), '2200')
      assert.equal(body.get('line_items[1][price_data][product_data][name]'), 'Late submission charge')
      assert.equal(body.get('metadata[grading_attempt_id]'), attemptId)
      assert.equal(body.get('success_url'), `${environment.APP_URL}/grading/applications?checkout=success&session_id={CHECKOUT_SESSION_ID}`)
      assert.equal(keys[0], `grading-${attemptId}-0-7700`)
    })
    await test.step('duplicate clicks reuse the original open session', async () => {
      assert.equal((await handleRequest(request({ ...selection, action: 'checkout', expected_amount: 7700 }))).status, 200)
      assert.equal(stripeCreates.length, 1)
    })
    await test.step('expired sessions are retired and requoted before reuse', async () => {
      sessionStatus = 'expired'
      assert.equal((await handleRequest(request({ ...selection, action: 'quote' }))).status, 200)
      assert.equal(storedSession, null)
      assert.equal(revision, 1)
    })
    await test.step('incorrect grades and ineligible applications cannot be charged', async () => {
      assert.equal((await handleRequest(request({ ...selection, target_grade_id: '4-kyu', action: 'checkout', expected_amount: 7700 }))).status, 409)
      eligible = false
      assert.equal((await handleRequest(request({ ...selection, action: 'quote' }))).status, 403)
      eligible = true
      assert.equal(stripeCreates.length, 1)
    })
    await test.step('payment status checks are scoped to the signed-in account', async () => {
      paymentStatus = 'paid'
      const response = await handleRequest(request({ action: 'status', session_id: 'cs_test_grading' }))
      assert.equal(response.status, 200)
      assert.equal((await response.json()).paid, true)
      amount = 5500
    })
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of before) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})
