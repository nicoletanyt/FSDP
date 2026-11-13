import assert from 'node:assert/strict'
import { handleRequest, safeEmailJsError } from '../send-attendance-notice/handler.ts'

const studentId = '00000000-0000-4000-8000-000000000011'
const secondStudentId = '00000000-0000-4000-8000-000000000012'
const adminId = '00000000-0000-4000-8000-000000000001'

Deno.test('attendance checks live risk, reserves the group atomically and sends one BCC email', async () => {
  const environment: Record<string, string> = {
    APP_URL: 'http://localhost:5173', SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test_anon', SUPABASE_SERVICE_ROLE_KEY: 'test_service',
    EMAILJS_EDITABLE_TEMPLATE_ID: 'test_template', EMAILJS_SERVICE_ID: 'test_service_id', EMAILJS_PUBLIC_KEY: 'test_public',
  }
  const previous = new Map(Object.keys(environment).map(key => [key, Deno.env.get(key)]))
  const originalFetch = globalThis.fetch
  for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value)
  let sends = 0
  let reserved: { student_id: string; status: string }[] = []
  let reservationConflict = false
  let providerStatus = 200
  let providerUnavailable = false
  let templateBody = 'Dear {{student_name}}, please reply if you need support.'
  let risk = 'at_risk'
  let historicalAcceptedAt: string | null = null
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.hostname === 'api.emailjs.com') {
      sends++
      const payload = await request.json()
      assert.equal(payload.template_params.to_email, 'suroul29@gmail.com')
      assert.equal(payload.template_params.bcc_emails, 'alex@example.com,sam@example.com')
      assert.equal(payload.template_params.email_body, 'Dear students, please reply if you need support.')
      if (providerUnavailable) throw new Error('Provider response unavailable')
      return new Response(providerStatus === 200 ? 'OK' : 'Invalid template; contact alex@example.com, key=abcdefghijklmnopqrstuv', { status: providerStatus })
    }
    if (url.pathname === '/auth/v1/user') return Response.json({ id: adminId })
    if (url.pathname === '/rest/v1/users') return Response.json({ role: 'administrator' })
    if (url.pathname === '/rest/v1/rpc/admin_attendance_monitoring') return Response.json([{
      id: studentId, first_name: 'Alex', last_name: 'Tan', email: 'alex@example.com', level: risk,
       missed: 2,
    }, { id: secondStudentId, first_name: 'Sam', last_name: 'Lee', email: 'sam@example.com', level: 'at_risk', missed: 3 }])
    if (url.pathname === '/rest/v1/admin_email_templates') return Response.json({
      subject: 'Checking in', body: templateBody, updated_at: '2026-11-11T00:00:00Z',
    })
    if (url.pathname === '/rest/v1/admin_attendance_email_sends') {
      if (request.method === 'GET') {
        if (url.searchParams.get('status') === 'eq.accepted') {
          const cutoff = url.searchParams.get('or')?.match(/completed_at\.gte\.([^,)]+)/)?.[1]
          assert.ok(cutoff)
          return Response.json(historicalAcceptedAt && historicalAcceptedAt > cutoff ? [{ student_id: studentId }] : [])
        }
        return Response.json(reserved.filter(row => row.status !== 'failed'))
      }
      if (request.method === 'POST') {
        const rows = await request.json()
        assert.equal(rows.length, 2)
        if (reservationConflict) return Response.json({ code: '23505' }, { status: 409 })
        reserved = rows.map((row: { student_id: string }) => ({ student_id: row.student_id, status: 'pending' }))
        return Response.json(rows.map((_: unknown, index: number) => ({ id: `00000000-0000-4000-8000-${String(index + 90).padStart(12, '0')}` })))
      }
      if (request.method === 'PATCH') {
        const { status } = await request.json()
        assert.equal(url.searchParams.get('id'), 'in.(00000000-0000-4000-8000-000000000090,00000000-0000-4000-8000-000000000091)')
        reserved = reserved.map(row => ({ ...row, status }))
        return new Response(null, { status: 204 })
      }
    }
    throw Error(`Unexpected request: ${request.method} ${request.url}`)
  }
  const makeRequest = (confirm: boolean, previewToken?: string, clientMode?: string, studentIds: string[] | null = [studentId, secondStudentId]) => new Request('http://localhost/functions/v1/send-attendance-notice', {
    method: 'POST', headers: { authorization: 'Bearer test-admin', origin: environment.APP_URL },
    body: JSON.stringify({ client_mode: clientMode ?? 'bcc', centre_id: null, student_ids: studentIds, confirm, preview_token: previewToken }),
  })
  try {
    assert.equal((await handleRequest(new Request('http://localhost', { method: 'POST', body: '{}' }))).status, 403)
    assert.equal((await handleRequest(makeRequest(false, undefined, 'individual'))).status, 409)
    assert.equal((await handleRequest(makeRequest(true, undefined, 'individual'))).status, 409)
    assert.equal(sends, 0)
    historicalAcceptedAt = new Date(Date.now() - 29 * 86400000).toISOString()
    assert.equal((await handleRequest(makeRequest(false))).status, 409)
    const unselected = await (await handleRequest(makeRequest(false, undefined, undefined, null))).json()
    assert.equal(unselected.count, 1)
    assert.equal(unselected.recipients[0].id, secondStudentId)
    historicalAcceptedAt = new Date(Date.now() - 31 * 86400000).toISOString()
    const preview = await handleRequest(makeRequest(false))
    assert.equal(preview.status, 200)
    const data = await preview.json()
    assert.equal(data.delivery_mode, 'bcc')
    assert.equal(data.count, 2)
    assert.equal(data.email_body, 'Dear students, please reply if you need support.')
    assert.equal(sends, 0)
    assert.equal((await handleRequest(makeRequest(true, 'wrong-token'))).status, 409)
    templateBody = 'Dear {{student_name}}, changed text.'
    assert.equal((await handleRequest(makeRequest(true, data.preview_token))).status, 409)
    templateBody = 'Dear {{student_name}}, please reply if you need support.'
    risk = 'healthy'
    assert.equal((await handleRequest(makeRequest(true, data.preview_token))).status, 409)
    risk = 'at_risk'
    reservationConflict = true
    assert.equal((await handleRequest(makeRequest(true, data.preview_token))).status, 409)
    assert.equal(sends, 0)
    reservationConflict = false
    const sent = await handleRequest(makeRequest(true, data.preview_token))
    assert.equal(sent.status, 200)
    assert.deepEqual(await sent.json(), { delivery_mode: 'bcc', status: 'accepted', recipient_count: 2, bcc_count: 2 })
    assert.equal(sends, 1)
    assert.equal(reserved.filter(row => row.status === 'accepted').length, 2)
    assert.equal((await handleRequest(makeRequest(true, data.preview_token))).status, 409)
    assert.equal(sends, 1)
    reserved = []
    providerStatus = 503
    const rejectedPreview = await (await handleRequest(makeRequest(false))).json()
    const rejected = await handleRequest(makeRequest(true, rejectedPreview.preview_token))
    assert.equal(rejected.status, 502)
    const rejectedError = (await rejected.json()).error
    assert.match(rejectedError, /HTTP 503\): Invalid template/)
    assert.doesNotMatch(rejectedError, /alex@example\.com|abcdefghijklmnopqrstuv/)
    assert.equal(reserved.filter(row => row.status === 'failed').length, 2)
    assert.equal(sends, 2)
    reserved = []
    providerUnavailable = true
    const uncertainPreview = await (await handleRequest(makeRequest(false))).json()
    assert.equal((await handleRequest(makeRequest(true, uncertainPreview.preview_token))).status, 502)
    assert.equal(reserved.filter(row => row.status === 'pending').length, 2)
    assert.equal((await handleRequest(makeRequest(true, uncertainPreview.preview_token))).status, 409)
    assert.equal(sends, 3)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of previous) value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value)
  }
})

Deno.test('EmailJS error messages redact email addresses and credentials', () => {
  assert.equal(safeEmailJsError('{"message":"Invalid recipient alex@example.com"}'), 'Invalid recipient [redacted email]')
  assert.equal(safeEmailJsError('<html><body>Denied</body></html>'), 'Denied')
})
