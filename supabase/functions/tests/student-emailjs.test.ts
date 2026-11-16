import assert from 'node:assert/strict'
import { sendStudentEmail } from '../_shared/student-emailjs.ts'
import { creditReceiptMessage, sendCreditReceipt } from '../_shared/credit-receipt.ts'
import { sendMembershipPaidEmail } from '../send-membership-email/handler.ts'

const studentId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
const member = { id: studentId, email: 'student@example.test', first_name: 'Jess', last_name: 'Tan', member_no: 'ASJ123' }

Deno.test('membership and credit sends use EmailJS To/BCC automatically and reserve retries', async () => {
  const environment = {
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'unit_test_service',
    EMAILJS_SERVICE_ID: 'service_test', EMAILJS_EDITABLE_TEMPLATE_ID: 'template_test', EMAILJS_PUBLIC_KEY: 'public_test',
  }
  const previous = new Map(Object.keys(environment).map(name => [name, Deno.env.get(name)]))
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value)
  const originalFetch = globalThis.fetch
  const reservations = new Map<string, string>()
  const sent: Record<string, unknown>[] = []
  let providerStatus = 200
  let ambiguous = false
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname === '/rest/v1/students') return Response.json([member])
    if (url.pathname === '/rest/v1/credit_purchases') return Response.json([{
      stripe_session_id: 'cs_credit', user_id: userId, pass_title: '10 Session Pass', credits: 10,
      unlimited: false, amount_cents: 27000, currency: 'sgd', created_at: '2026-11-15T00:00:00Z',
    }])
    if (url.pathname === '/rest/v1/users') return Response.json([{ email: 'buyer@example.test', first_name: 'Ari', last_name: 'Lee' }])
    if (url.pathname === '/rest/v1/credit_accounts') return Response.json([{ credits: 20, unlimited: false }])
    if (url.pathname === '/rest/v1/student_email_sends' && request.method === 'POST') {
      const { send_key } = await request.json()
      if (reservations.has(send_key)) return Response.json([])
      reservations.set(send_key, 'pending')
      return Response.json([{ send_key }])
    }
    if (url.pathname === '/rest/v1/student_email_sends' && request.method === 'PATCH') {
      const { status } = await request.json()
      reservations.set(url.searchParams.get('send_key')!.slice(3), status)
      return new Response(null, { status: 204 })
    }
    if (url.hostname === 'api.emailjs.com') {
      if (ambiguous) throw new Error('Network response lost')
      sent.push(await request.json())
      return new Response(providerStatus === 200 ? 'OK' : 'Rejected', { status: providerStatus })
    }
    throw new Error(`Unexpected request: ${request.method} ${url}`)
  }
  try {
    assert.equal(await sendMembershipPaidEmail(studentId), 'accepted')
    assert.equal(await sendMembershipPaidEmail(studentId), 'already-reserved')
    assert.equal(await sendCreditReceipt('cs_credit'), 'accepted')
    assert.equal(await sendCreditReceipt('cs_credit'), 'already-reserved')
    assert.equal(sent.length, 2)
    for (const [index, email] of ['student@example.test', 'buyer@example.test'].entries()) {
      const params = sent[index].template_params as Record<string, string>
      assert.equal(params.to_email, 'suroul29@gmail.com')
      assert.equal(params.bcc_emails, email)
      assert.ok(params.email_subject)
      assert.ok(params.email_body)
      assert.equal(sent[index].template_id, 'template_test')
    }
    assert.match((sent[0].template_params as Record<string, string>).email_body, /membership is now active/)
    assert.match((sent[1].template_params as Record<string, string>).email_body, /S\$270\.00/)
    assert.equal(reservations.get(`membership-paid/${studentId}/ASJ123/v1`), 'accepted')
    assert.equal(reservations.get('credit-receipt/cs_credit/v1'), 'accepted')

    providerStatus = 403
    await assert.rejects(sendStudentEmail({ to: member.email, subject: 'Test', text: 'Body' }, 'failed/test'), /not accepted/)
    assert.equal(reservations.get('failed/test'), 'failed')
    assert.equal(await sendStudentEmail({ to: member.email, subject: 'Test', text: 'Body' }, 'failed/test'), 'already-reserved')
    ambiguous = true
    await assert.rejects(sendStudentEmail({ to: member.email, subject: 'Test', text: 'Body' }, 'uncertain/test'), /not accepted/)
    assert.equal(reservations.get('uncertain/test'), 'pending')
    assert.equal(sent.length, 3)
    await assert.rejects(sendStudentEmail({ to: 'bad,other@example.test', subject: 'Test', text: 'Body' }, 'invalid/test'))
    assert.equal(reservations.has('invalid/test'), false)
    ambiguous = false
    providerStatus = 200
    await sendStudentEmail({ to: member.email, subject: 'Test', text: '<img src=x onerror=alert(1)>' }, 'escaped/test')
    const escapedBody = (sent.at(-1)!.template_params as Record<string, string>).email_body
    assert.match(escapedBody, /&lt;img/)
    assert.ok(!escapedBody.includes('<img'))
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of previous) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value)
  }
})

Deno.test('credit receipt keeps the purchase details and balance in the email body', async () => {
  const purchase = { stripe_session_id: 'cs_test_123456789012', user_id: userId,
    pass_title: '10 Session Pass', credits: 10, unlimited: false,
    amount_cents: 27000, currency: 'sgd', created_at: '2026-11-15T00:00:00Z' }
  const message = creditReceiptMessage({ email: 'buyer@example.test', first_name: 'Ari', last_name: 'Lee' }, purchase,
    { credits: 20, unlimited: false })
  assert.equal(message.to, 'buyer@example.test')
  assert.match(message.text, /Class pass: 10 Session Pass/)
  assert.match(message.text, /Credits added: 10/)
  assert.match(message.text, /Your balance now: 20 credits/)
  assert.match(message.text, /Payment reference: 123456789012/)
})
