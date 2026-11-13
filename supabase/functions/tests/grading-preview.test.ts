import assert from 'node:assert/strict'
import { handleRequest } from '../create-grading-checkout/handler.ts'
import { handleRequest as webhook } from '../stripe-webhook/handler.ts'
import { cryptoProvider, getStripe } from '../_shared/stripe.ts'

Deno.test('grading preview is test-only, database-priced, account-scoped, and never writes eligibility records', async (test) => {
  const env = { APP_URL: 'http://localhost:5173', SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test_anon', SUPABASE_SERVICE_ROLE_KEY: 'test_service', STRIPE_SECRET_KEY: 'sk_test_unit_test' }
  const previous = new Map(Object.keys(env).map((key) => [key, Deno.env.get(key)]))
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value)
  const original = globalThis.fetch
  const user = '00000000-0000-4000-8000-000000000001'
  const nonce = '00000000-0000-4000-8000-000000000002'
  let sessionUser = user
  let paid = false
  let linked = true
  let draft: Record<string, unknown> | null = null
  let failSave = false
  const draftId = '00000000-0000-4000-8000-000000000004'
  const creates: URLSearchParams[] = []
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname === '/auth/v1/user') return Response.json({ id: user })
    if (url.pathname === '/rest/v1/users') return Response.json({ role: 'student' })
    if (url.pathname === '/rest/v1/grading_application_drafts') {
      if (failSave) return Response.json({ message: 'Draft storage unavailable' }, { status: 500 })
      if (request.method === 'POST') {
        draft ??= { id: draftId, status: 'draft', ...(await request.json()) }
        return new Response(null, { status: 201 })
      }
      if (request.method === 'PATCH') {
        draft = { ...draft, ...(await request.json()) }
        return Response.json({ id: draftId })
      }
      return Response.json(draft)
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      assert.equal(request.method, 'GET', 'preview may only write its isolated draft table')
      if (url.pathname === '/rest/v1/students') {
        assert.equal(url.searchParams.get('user_id'), `eq.${user}`)
        return Response.json(linked ? { id: nonce, current_grade_id: 'blue', date_of_birth: '2004-10-13' } : null)
      }
      if (url.pathname === '/rest/v1/grades') return Response.json([
        { id: 'blue', label: 'Blue', sort_order: 7 }, { id: 'silver', label: 'Silver', sort_order: 8 },
        { id: 'gold', label: 'Blue-Gold', sort_order: 9 }, { id: 'brown', label: 'Brown', sort_order: 10 },
      ])
      if (url.pathname === '/rest/v1/grade_tracks') return Response.json([
        { grade_id: 'silver', track: 'children' }, { grade_id: 'gold', track: 'adult' }, { grade_id: 'brown', track: 'adult' },
      ])
      if (url.pathname === '/rest/v1/grade_requirements') return Response.json([{ grade_id: 'gold', track: 'adult', fee_cents: 5500 }])
    }
    if (url.pathname === '/v1/checkout/sessions' && request.method === 'POST') {
      creates.push(new URLSearchParams(await request.text()))
      return Response.json({ id: 'cs_test_preview', livemode: false, url: 'https://checkout.stripe.com/c/pay/preview' })
    }
    if (url.pathname === '/v1/checkout/sessions/cs_test_preview') return Response.json({ id: 'cs_test_preview', livemode: false,
      mode: 'payment', currency: 'sgd', amount_total: 5500,
      client_reference_id: sessionUser, payment_status: paid ? 'paid' : 'unpaid',
      metadata: { grading_preview: 'true', grading_preview_user_id: sessionUser, grading_draft_id: draftId, target_grade_id: 'gold' } })
    throw new Error(`Unexpected request: ${url.pathname}`)
  }
  const request = (body: object) => new Request('http://localhost', { method: 'POST',
    headers: { origin: env.APP_URL, authorization: 'Bearer test_student', 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const body = { action: 'test-checkout', request_id: nonce, target_grade_id: 'gold', expected_amount: 5500 }
  try {
    await test.step('creates the S$55 test checkout for only the next adult grade', async () => {
      assert.equal((await handleRequest(request(body))).status, 200)
      assert.equal(creates.length, 1)
      assert.equal(creates[0].get('line_items[0][price_data][unit_amount]'), '5500')
      assert.equal(creates[0].get('line_items[0][price_data][currency]'), 'sgd')
      assert.equal(creates[0].get('metadata[grading_preview]'), 'true')
      assert.equal(creates[0].get('metadata[grading_attempt_id]'), null)
      assert.match(creates[0].get('success_url')!, /checkout=test-success/)
      assert.equal(creates[0].get('metadata[grading_draft_id]'), draftId)
      assert.equal(draft?.status, 'checkout_open')
      assert.equal(draft?.stripe_session_id, 'cs_test_preview')
      assert.equal(draft?.base_fee_cents, 5500)
    })
    await test.step('rejects grade skipping and client-side price tampering', async () => {
      assert.equal((await handleRequest(request({ ...body, target_grade_id: 'brown' }))).status, 409)
      assert.equal((await handleRequest(request({ ...body, expected_amount: 1 }))).status, 409)
      assert.equal(creates.length, 1)
    })
    await test.step('requires a linked student', async () => {
      linked = false
      assert.equal((await handleRequest(request(body))).status, 403)
      linked = true
    })
    await test.step('only Stripe-verified test status for the owner is returned', async () => {
      const status = { action: 'test-status', session_id: 'cs_test_preview' }
      assert.equal((await (await handleRequest(request(status))).json()).paid, false)
      paid = true
      assert.equal((await (await handleRequest(request(status))).json()).paid, true)
      assert.equal(draft?.status, 'preview_paid')
      sessionUser = nonce
      assert.equal((await handleRequest(request(status))).status, 404)
    })
    await test.step('a database save failure cannot redirect to Stripe with an unsaved form', async () => {
      failSave = true
      assert.equal((await handleRequest(request(body))).status, 500)
      assert.equal(creates.length, 1)
      failSave = false
    })
    await test.step('live keys cannot create a preview charge', async () => {
      Deno.env.set('STRIPE_SECRET_KEY', 'sk_live_not_allowed')
      assert.equal((await handleRequest(request(body))).status, 500)
      assert.equal(creates.length, 1)
    })
  } finally {
    globalThis.fetch = original
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
})

Deno.test('signed preview payment webhooks never finalize a formal application or payment', async () => {
  const names = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']
  const previous = names.map((name) => Deno.env.get(name))
  Deno.env.set(names[0], 'sk_test_unit_test')
  Deno.env.set(names[1], 'whsec_unit_test')
  const original = globalThis.fetch
  globalThis.fetch = () => { throw new Error('Preview webhook must not call a database or mutate Stripe') }
  try {
    const body = JSON.stringify({ id: 'evt_preview', type: 'checkout.session.completed', livemode: false,
      data: { object: { id: 'cs_test_preview', mode: 'payment', payment_status: 'paid', metadata: { grading_preview: 'true' } } } })
    const signature = await getStripe().webhooks.generateTestHeaderStringAsync({ payload: body, secret: 'whsec_unit_test', cryptoProvider })
    assert.equal((await webhook(new Request('http://localhost', { method: 'POST', body,
      headers: { 'stripe-signature': signature } }))).status, 200)
  } finally {
    globalThis.fetch = original
    names.forEach((name, index) => {
      if (previous[index] === undefined) Deno.env.delete(name)
      else Deno.env.set(name, previous[index]!)
    })
  }
})
