import assert from 'node:assert/strict'
import { handleRequest as invitation, safeEmailJsError } from '../send-grading-invitation/handler.ts'
import { handleRequest as checkout } from '../create-grading-checkout/handler.ts'
import { handleRequest as webhook } from '../stripe-webhook/handler.ts'
import { cryptoProvider, getStripe } from '../_shared/stripe.ts'

const invitationBody = `Dear Student,

You are invited to apply for an upcoming Aikido Shinju-Kai grading.

Children's grading
Date: {{children_grading_date}}
Applications close: {{children_application_close_date}}

Adult grading
Date: {{adult_grading_date}}
Applications close: {{adult_application_close_date}}

Venue
Aikido Shinju-Kai Headquarters
Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630

Apply here: https://fsdp-kappa.vercel.app/grading

Please apply by the closing date shown for your grading. When you sign in, you will see only the grading opportunities available to you. Your application is submitted after payment is confirmed.

We look forward to seeing you on the mat.

Aikido Shinju-Kai`

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
    EMAILJS_SERVICE_ID: 'service_test', EMAILJS_EDITABLE_TEMPLATE_ID: 'template_editable_test', EMAILJS_PUBLIC_KEY: 'public_test',
    EMAILJS_PRIVATE_KEY: 'secret-private-key-123456789',
  }
  const original = new Map(Object.keys(environment).map((name) => [name, Deno.env.get(name)]))
  const originalFetch = globalThis.fetch
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value)
  const eventId = '699dbd22-d137-4be4-81bd-10b6a2ab710c'
  let sends = 0
  let reservations = 0
  let accepted = false
  let rejected = false
  let savedError = ''
  let allMode = false
  let savedSubject = 'Aikido Shinju-Kai | Grading invitation'
  let adultOpen = true
  let previewedBody = ''
  const secondEventId = '699dbd22-d137-4be4-81bd-10b6a2ab710d'
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.hostname === 'api.emailjs.com') {
      sends++
      assert.equal(request.method, 'POST')
      const payload = await request.json()
      assert.equal(payload.service_id, environment.EMAILJS_SERVICE_ID)
      assert.equal(payload.template_id, environment.EMAILJS_EDITABLE_TEMPLATE_ID)
      assert.equal(payload.accessToken, environment.EMAILJS_PRIVATE_KEY)
      assert.equal(payload.template_params.to_email, 'suroulomg@gmail.com')
      assert.equal(payload.template_params.email_subject, 'Aikido Shinju-Kai | Grading invitation')
      assert.equal(payload.template_params.bcc_emails, allMode
        ? 'test@example.com,adult@example.com,mq07110@gmail.com' : 'test@example.com,mq07110@gmail.com')
      assert.equal(payload.template_params.email_body, previewedBody)
      assert.match(payload.template_params.email_body, /Date: 6 December 2026/)
      assert.match(payload.template_params.email_body, /Applications close: 22 November 2026/)
      assert.match(payload.template_params.email_body, /Date: 13 December 2026/)
      assert.match(payload.template_params.email_body, /Applications close: 29 November 2026/)
      assert.equal(payload.template_params.email_body.split('https://fsdp-kappa.vercel.app/grading').length, 2)
      assert.doesNotMatch(payload.template_params.email_body, /{{|\[insert actual link here\]|http:\/\/localhost:5173\/grading/)
      return rejected
        ? new Response(`Forbidden: origin https://client.invalid is blocked for test@example.com; accessToken: ${environment.EMAILJS_PRIVATE_KEY}`, { status: 403 })
        : new Response('OK')
    }
    if (url.pathname === '/auth/v1/user') return Response.json({ id: '00000000-0000-4000-8000-000000000001' })
    if (url.pathname === '/rest/v1/users') return Response.json({ role: 'administrator' })
    if (url.pathname === '/rest/v1/gradings') return Response.json([{
      event_id: eventId, track: 'children', grading_date: '2026-12-06', application_opens_on: '2026-10-25',
      application_deadline: '2026-11-22', reporting_release_on: '2026-11-29', reporting_time: null,
      events: { name: 'Children’s grading', centres: { name: 'ASK Headquarters Dojo', address: '9 Sin Ming Road' } },
    }, ...(adultOpen ? [{
      event_id: secondEventId, track: 'adult', grading_date: '2026-12-13', application_opens_on: '2026-11-01',
      application_deadline: '2026-11-29', reporting_release_on: '2026-12-06', reporting_time: null,
      events: { name: 'Adult grading', centres: { name: 'ASK Headquarters Dojo', address: '9 Sin Ming Road' } },
    }] : [])])
    if (url.pathname === '/rest/v1/admin_email_templates') return Response.json({
      subject: savedSubject,
      body: invitationBody,
    })
    if (url.pathname === '/rest/v1/rpc/eligible_grading_students') {
      if ((await request.json()).target_event === secondEventId) return Response.json([
        { student_id: 'student-2', email: 'adult@example.com' }, { student_id: 'student-1', email: 'test@example.com' },
      ])
      return Response.json([{ student_id: 'student-1', email: 'test@example.com' }, { student_id: 'student-1', email: 'test@example.com' }])
    }
    if (url.pathname === '/rest/v1/grading_email_sends' && request.method === 'POST') {
      reservations++
      if (accepted) return Response.json({ code: '23505', message: 'duplicate' }, { status: 409 })
      const body = await request.json()
      assert.equal(body.recipient_count, allMode ? 3 : 2)
      assert.equal(body.event_name, allMode ? 'All eligible students' : 'Children’s grading')
      if (allMode) assert.match(body.campaign_key, /^[a-f0-9]{64}$/)
      else assert.equal(body.campaign_key, null)
      return Response.json({ id: '00000000-0000-4000-8000-000000000002' })
    }
    if (url.pathname === '/rest/v1/grading_email_sends' && request.method === 'PATCH') {
      const body = await request.json()
      assert.equal(body.status, rejected ? 'failed' : 'accepted')
      savedError = body.error ?? ''
      accepted = !rejected
      return new Response(null, { status: 204 })
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`)
  }
  const makeRequest = (confirm: boolean, previewToken?: string, selected: string | null = eventId) => new Request('http://localhost/functions/v1/send-grading-invitation', {
    method: 'POST', headers: { authorization: 'Bearer signed-in-test-admin', origin: environment.APP_URL },
    body: JSON.stringify({ event_id: selected, confirm, preview_token: previewToken }),
  })
  try {
    const preview = await invitation(makeRequest(false))
    assert.equal(preview.status, 200)
    const contents = await preview.json()
    assert.deepEqual(contents.bcc_emails, ['test@example.com', 'mq07110@gmail.com'])
    assert.equal(contents.eligible, 1)
    assert.equal(contents.send_ready, true)
    assert.match(contents.email_body, /Apply here: https:\/\/fsdp-kappa\.vercel\.app\/grading/)
    assert.equal(contents.email_body, invitationBody
      .replace('{{children_grading_date}}', '6 December 2026')
      .replace('{{children_application_close_date}}', '22 November 2026')
      .replace('{{adult_grading_date}}', '13 December 2026')
      .replace('{{adult_application_close_date}}', '29 November 2026'))
    previewedBody = contents.email_body
    assert.equal(contents.preview_token.length, 64)
    assert.equal(sends, 0)
    assert.equal(reservations, 0)
    adultOpen = false
    const childrenOnly = await invitation(makeRequest(false))
    assert.equal(childrenOnly.status, 200)
    assert.match((await childrenOnly.json()).email_body, /Adult grading\nDate: Not currently open/)
    adultOpen = true
    assert.equal((await invitation(makeRequest(true, 'stale'))).status, 409)
    assert.equal(reservations, 0)
    savedSubject = 'Updated grading invitation'
    assert.equal((await invitation(makeRequest(true, contents.preview_token))).status, 409)
    savedSubject = 'Aikido Shinju-Kai | Grading invitation'
    Deno.env.delete('EMAILJS_EDITABLE_TEMPLATE_ID')
    const missingTemplate = await invitation(makeRequest(false))
    assert.equal((await missingTemplate.json()).send_ready, false)
    assert.equal((await invitation(makeRequest(true, contents.preview_token))).status, 409)
    assert.equal(reservations, 0)
    Deno.env.set('EMAILJS_EDITABLE_TEMPLATE_ID', environment.EMAILJS_EDITABLE_TEMPLATE_ID)
    assert.equal((await invitation(makeRequest(true, contents.preview_token))).status, 200)
    assert.equal((await invitation(makeRequest(true, contents.preview_token))).status, 409)
    assert.equal(sends, 1)
    assert.equal(reservations, 2)
    accepted = false
    rejected = true
    const failure = await invitation(makeRequest(true, contents.preview_token))
    assert.equal(failure.status, 502)
    assert.equal((await failure.json()).error, savedError)
    assert.match(savedError, /EmailJS HTTP 403: Forbidden: origin/)
    assert.doesNotMatch(savedError, /test@example\.com|client\.invalid|secret-private-key-123456789/)
    assert.equal(sends, 2)
    rejected = false
    allMode = true
    const all = await invitation(makeRequest(false, undefined, null))
    assert.equal(all.status, 200)
    const allPreview = await all.json()
    assert.equal(allPreview.eligible, 2)
    assert.deepEqual(allPreview.bcc_emails, ['test@example.com', 'adult@example.com', 'mq07110@gmail.com'])
    assert.equal(sends, 2)
    assert.equal((await invitation(makeRequest(true, allPreview.preview_token, null))).status, 200)
    assert.equal(sends, 3)
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of original) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})

Deno.test('EmailJS diagnostics redact credentials, addresses, long values and unreadable responses', () => {
  const body = JSON.stringify({ message: 'Denied for person@example.com; token=abcdef0123456789abcdef0123456789 at https://example.com/private' })
  const summary = safeEmailJsError(body)
  assert.match(summary, /Denied/)
  assert.doesNotMatch(summary, /person@example\.com|abcdef0123456789|https:\/\//)
  assert.ok(summary.length <= 200)
  assert.equal(safeEmailJsError('<html><body>Denied</body></html>'), 'Denied')
  assert.equal(safeEmailJsError(''), 'No readable provider message.')
})
