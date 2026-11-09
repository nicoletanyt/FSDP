import assert from 'node:assert/strict'
import { emailJsFailureReason, handleRequest } from '../report-class-unavailability/handler.ts'

const eventId = '00000000-0000-4000-8000-000000000012'
const requestId = '00000000-0000-4000-8000-000000000013'
const host = 'https://example.supabase.co'

Deno.test('EmailJS diagnostics classify provider errors without persisting response contents', () => {
  const secret = 'zzSensitiveValue123456789'
  const address = 'suroul29@gmail.com'
  const cases = [
    ['The template ID is invalid', 'EmailJS template was not found or is invalid.'],
    ['Service not found', 'EmailJS service was not found, is invalid, or is disconnected.'],
    ['The user_id is invalid', 'EmailJS credentials or account authorization were rejected.'],
    ['Invalid to_email address', 'EmailJS recipient address or template recipient setting is invalid.'],
    ['Rate limit exceeded', 'EmailJS account limit or rate limit was reached.'],
    ['Blocked domain', 'EmailJS origin or domain policy rejected the request.'],
    [`Unknown error: ${secret} ${address} test-admin-template`, 'EmailJS rejected the request; its response could not be safely classified.'],
  ]
  for (const [body, expected] of cases) {
    const reason = emailJsFailureReason(body)
    assert.equal(reason, expected)
    assert.ok(!reason.includes(secret) && !reason.includes(address) && !reason.includes('test-admin-template'))
  }
})

Deno.test('class-cover endpoint rejects unauthorized callers and origins without sending email', async () => {
  const previous = Deno.env.get('APP_URL')
  const originalFetch = globalThis.fetch
  let sends = 0
  Deno.env.set('APP_URL', 'http://localhost:5173')
  globalThis.fetch = () => { sends++; throw new Error('External request must not occur') }
  try {
    const allowed = { origin: 'http://localhost:5173' }
    assert.equal((await handleRequest(new Request(host, { method: 'OPTIONS', headers: allowed }))).status, 204)
    assert.equal((await handleRequest(new Request(host, { method: 'OPTIONS', headers: { origin: 'http://192.168.1.13:5173' } }))).status, 204)
    assert.equal((await handleRequest(new Request(host, { method: 'POST', headers: { origin: 'https://attacker.test' } }))).status, 403)
    assert.equal((await handleRequest(new Request(host, { method: 'POST', headers: allowed, body: '{}' }))).status, 401)
    assert.equal(sends, 0)
  } finally {
    globalThis.fetch = originalFetch
    if (previous === undefined) Deno.env.delete('APP_URL')
    else Deno.env.set('APP_URL', previous)
  }
})

Deno.test('class-cover request emails admin once, and retry returns recorded status', async () => {
  const names = ['APP_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
    'EMAILJS_SERVICE_ID', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_ADMIN_UNAVAILABILITY_TEMPLATE_ID', 'ADMIN_UNAVAILABILITY_EMAIL']
  const previous = names.map(name => Deno.env.get(name))
  const values = ['https://deployed.example.test', host, 'test-anon', 'test-service', 'test-service-id', 'test-public-key',
    'test-admin-template', 'suroul29@gmail.com']
  names.forEach((name, i) => Deno.env.set(name, values[i]))
  const originalFetch = globalThis.fetch
  let emailCalls = 0
  let notificationStatus = 'pending'
  let providerRejects = false
  let recorded: Record<string, unknown> = {}
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.url === `${host}/auth/v1/user`) return Response.json({ id: '00000000-0000-4000-8000-000000000014', aud: 'authenticated', role: 'authenticated', email: 'instructor@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() })
    if (request.url.includes('/rest/v1/rpc/report_instructor_class_unavailability')) {
      assert.deepEqual(await request.json(), { target_event: eventId })
      return Response.json({ id: requestId, event_id: eventId, notification_status: notificationStatus })
    }
    if (request.url.includes('/rest/v1/events?')) return Response.json({
      id: eventId, name: 'Evening class', starts_at: '2099-11-08T11:00:00Z', ends_at: '2099-11-08T12:00:00Z',
      centre_id: '00000000-0000-4000-8000-000000000015', status: 'scheduled',
      centres: { name: 'Central Dojo' }, instructors: { first_name: 'Test', last_name: 'Instructor' },
    })
    if (request.url.includes('/rest/v1/instructor_class_unavailability?')) {
      if (request.method === 'PATCH') {
        const body = await request.json()
        if (body.notification_updated_at) recorded = body
        if (body.notification_status === 'sending' && notificationStatus === 'pending') notificationStatus = 'sending'
        else if (body.notification_status === 'accepted') notificationStatus = 'accepted'
        else if (body.notification_status === 'failed') notificationStatus = 'failed'
        return Response.json({ id: requestId })
      }
    }
    if (request.url === 'https://api.emailjs.com/api/v1.0/email/send') {
      emailCalls++
      const body = await request.json()
      assert.equal(body.template_id, 'test-admin-template')
      assert.equal(body.template_params.to_email, 'suroul29@gmail.com')
      assert.equal(body.template_params.instructor_name, 'Test Instructor')
      assert.equal(body.template_params.class_name, 'Evening class')
      const calendarLink = new URL(body.template_params.admin_calendar_url)
      assert.equal(calendarLink.origin, 'http://localhost:5173')
      assert.equal(calendarLink.pathname, '/admin/calendar')
      assert.equal(calendarLink.searchParams.get('session'), `${eventId}:2099-11-08`)
      return new Response(providerRejects ? 'The user_id is invalid; suroul29@gmail.com private-key-dont-store-this' : 'OK', { status: providerRejects ? 403 : 200 })
    }
    throw new Error(`Unexpected request ${request.method} ${request.url}`)
  }
  const request = () => new Request(host, { method: 'POST', headers: {
    origin: 'https://deployed.example.test', authorization: 'Bearer test-jwt', 'content-type': 'application/json',
  }, body: JSON.stringify({ event_id: eventId }) })
  try {
    const first = await handleRequest(request())
    assert.equal(first.status, 200)
    assert.equal((await first.json()).notification_status, 'accepted')
    const again = await handleRequest(request())
    assert.equal((await again.json()).notification_status, 'accepted')
    assert.equal(emailCalls, 1)
    assert.equal(recorded.notification_http_status, 200)
    assert.equal(recorded.notification_failure_reason, null)
    notificationStatus = 'pending'
    Deno.env.delete('EMAILJS_ADMIN_UNAVAILABILITY_TEMPLATE_ID')
    assert.deepEqual((await (await handleRequest(request())).json()).notification_status, 'pending')
    assert.equal(emailCalls, 1)
    Deno.env.set('EMAILJS_ADMIN_UNAVAILABILITY_TEMPLATE_ID', 'test-admin-template')
    providerRejects = true
    assert.equal((await (await handleRequest(request())).json()).notification_status, 'failed')
    assert.equal(emailCalls, 2)
    assert.equal(recorded.notification_http_status, 403)
    assert.equal(recorded.notification_failure_reason, 'EmailJS credentials or account authorization were rejected.')
    assert.ok(!JSON.stringify(recorded).includes('suroul29@gmail.com'))
    assert.equal((await (await handleRequest(request())).json()).notification_status, 'failed')
    assert.equal(emailCalls, 2)
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, i) => previous[i] === undefined ? Deno.env.delete(name) : Deno.env.set(name, previous[i]!))
  }
})
