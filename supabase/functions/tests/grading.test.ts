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

Deno.test('admin grading preview does not send; confirmation sends one email with the dummy BCC and unchanged link', async () => {
  const environment: Record<string, string> = {
    APP_URL: 'http://localhost:5173', SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'unit_test_anon', SUPABASE_SERVICE_ROLE_KEY: 'unit_test_service',
    EMAILJS_SERVICE_ID: 'service_test', EMAILJS_TEMPLATE_ID: 'template_test', EMAILJS_PUBLIC_KEY: 'public_test',
  }
  const original = new Map(Object.keys(environment).map((name) => [name, Deno.env.get(name)]))
  const originalFetch = globalThis.fetch
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value)
  const eventId = '699dbd22-d137-4be4-81bd-10b6a2ab710c'
  let sends = 0
  let reservations = 0
  let accepted = false
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.hostname === 'api.emailjs.com') {
      sends++
      assert.equal(request.method, 'POST')
      const payload = await request.json()
      assert.equal(payload.service_id, environment.EMAILJS_SERVICE_ID)
      assert.equal(payload.template_id, environment.EMAILJS_TEMPLATE_ID)
      assert.deepEqual(payload.template_params, {
        to_email: 'suroulomg@gmail.com', bcc_emails: 'test@example.com,mq07110@gmail.com',
        grading_date: '30 November 2026', grading_time: '9:00 am',
        grading_location: 'Ci Yuan Dojo', application_deadline: '2026-11-16',
        application_url: `${environment.APP_URL}/grading`,
      })
      return new Response('OK')
    }
    if (url.pathname === '/auth/v1/user') return Response.json({ id: '00000000-0000-4000-8000-000000000001' })
    if (url.pathname === '/rest/v1/users') return Response.json({ role: 'administrator' })
    if (url.pathname === '/rest/v1/events') return Response.json({ name: 'Ci Yuan grading',
      starts_at: '2026-11-30T01:00:00+00:00', centres: [{ name: 'Ci Yuan Dojo' }],
      gradings: [{ application_deadline: '2026-11-16' }] })
    if (url.pathname === '/rest/v1/rpc/eligible_grading_students') {
      return Response.json([{ email: 'test@example.com' }, { email: 'test@example.com' }])
    }
    if (url.pathname === '/rest/v1/grading_email_sends' && request.method === 'POST') {
      reservations++
      if (accepted) return Response.json({ code: '23505', message: 'duplicate' }, { status: 409 })
      const body = await request.json()
      assert.equal(body.recipient_count, 2)
      return Response.json({ id: '00000000-0000-4000-8000-000000000002' })
    }
    if (url.pathname === '/rest/v1/grading_email_sends' && request.method === 'PATCH') {
      const body = await request.json()
      assert.equal(body.status, 'accepted')
      accepted = true
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`)
  }
  const makeRequest = (confirm: boolean) => new Request('http://localhost/functions/v1/send-grading-invitation', {
    method: 'POST', headers: { authorization: 'Bearer signed-in-test-admin', origin: environment.APP_URL },
    body: JSON.stringify({ event_id: eventId, confirm }),
  })
  try {
    const preview = await invitation(makeRequest(false))
    assert.equal(preview.status, 200)
    assert.deepEqual((await preview.json()).bcc_emails, ['test@example.com', 'mq07110@gmail.com'])
    assert.equal(sends, 0)
    assert.equal(reservations, 0)
    assert.equal((await invitation(makeRequest(true))).status, 200)
    assert.equal((await invitation(makeRequest(true))).status, 409)
    assert.equal(sends, 1)
    assert.equal(reservations, 2)
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of original) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})
