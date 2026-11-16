import assert from 'node:assert/strict'
import { enrolmentMessage, handleRequest, type Dependencies } from '../send-class-enrolment-email/handler.ts'

const student = {
  id: '00000000-0000-4000-8000-000000000001', email: 'student@example.com',
  first_name: 'Kai', last_name: 'Tan',
}
const eventId = '00000000-0000-4000-8000-000000000002'
const session = {
  id: eventId, name: 'Adults', starts_at: '2099-11-16T10:00:00+08:00',
  ends_at: '2099-11-16T11:00:00+08:00', status: 'scheduled',
  centres: { name: 'ASK Headquarters Dojo' }, instructors: null,
}

function setup(overrides: Partial<Dependencies> = {}) {
  const sent: { message: ReturnType<typeof enrolmentMessage>; key: string }[] = []
  const calls: string[] = []
  const dependencies: Dependencies = {
    headers: () => ({ allowed: true, headers: {}, appOrigin: 'https://example.com' }),
    authenticate: async () => { calls.push('auth'); return 'owner-user' },
    loadStudent: async userId => { assert.equal(userId, 'owner-user'); calls.push('student'); return student },
    loadBooking: async (id, studentId) => {
      assert.equal(id, eventId)
      assert.equal(studentId, student.id)
      calls.push('booking')
      return { moved_from_event_id: null }
    },
    loadSession: async id => { assert.equal(id, eventId); calls.push('session'); return session },
    send: async (message, key) => { sent.push({ message, key }); return 'accepted' },
    ...overrides,
  }
  return { dependencies, sent, calls }
}

function request(body: unknown = { event_id: eventId }) {
  return new Request('https://example.com/functions/v1/send-class-enrolment-email', {
    method: 'POST', body: JSON.stringify(body),
  })
}

Deno.test('sends confirmed booking details to the stored student via the shared EmailJS sender', async () => {
  const { dependencies, sent, calls } = setup()
  const response = await handleRequest(request({ event_id: eventId, email: 'attacker@example.com', name: 'Forged' }), dependencies)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'accepted' })
  assert.deepEqual(calls, ['auth', 'student', 'booking', 'session'])
  assert.equal(sent.length, 1)
  assert.equal(sent[0].message.to, student.email)
  assert.match(sent[0].message.text, /Adults/)
  assert.match(sent[0].message.text, /ASK Headquarters Dojo/)
  assert.match(sent[0].message.text, /Coach to be announced/)
  assert.match(sent[0].message.text, /Date: 16 November 2099, Monday\nTime: 10:00 - 11:00/)
  assert.ok(!sent[0].message.text.includes('When:'))
  assert.equal(sent[0].key, `class-enrolment/${student.id}/${eventId}/v1`)
  assert.ok(!sent[0].message.text.includes('Forged'))
  assert.ok(!sent[0].message.text.includes('attacker@example.com'))
  const repeat = setup({ send: async () => 'already-reserved' })
  assert.deepEqual(await (await handleRequest(request(), repeat.dependencies)).json(), { status: 'already-reserved' })
})

Deno.test('formats an assigned instructor without allowing browser-provided class details', async () => {
  const message = enrolmentMessage(student, {
    ...session, name: '<script>alert(1)</script>',
    instructors: { first_name: 'Robin', last_name: 'Tan' },
  })
  assert.match(message.text, /Instructor: Robin Tan/)
  assert.match(message.text, /Class: <script>alert\(1\)<\/script>/)
  // The shared EmailJS sender escapes all HTML before inserting it in the template.
})

Deno.test('preflight, blocked origins, unauthenticated and invalid requests do not send', async () => {
  const context = setup()
  assert.equal((await handleRequest(new Request('https://example.com', { method: 'OPTIONS' }), context.dependencies)).status, 204)
  assert.equal((await handleRequest(new Request('https://example.com'), context.dependencies)).status, 405)
  assert.equal((await handleRequest(request(), setup({ headers: () => ({ allowed: false, headers: {}, appOrigin: '' }) }).dependencies)).status, 403)
  assert.equal((await handleRequest(request(), setup({ authenticate: async () => null }).dependencies)).status, 401)
  for (const body of [{ event_id: 'invalid' }, { event_id: 123 }, {}, [], null]) {
    assert.equal((await handleRequest(request(body), context.dependencies)).status, 400)
  }
  assert.equal(context.sent.length, 0)
})

Deno.test('missing booking, moved booking, past session and missing student never send', async () => {
  for (const overrides of [
    { loadStudent: async () => null },
    { loadBooking: async () => null },
    { loadBooking: async () => ({ moved_from_event_id: eventId }) },
    { loadSession: async () => ({ ...session, starts_at: '2020-01-01T10:00:00+08:00' }) },
    { loadSession: async () => ({ ...session, status: 'cancelled' }) },
    { loadSession: async () => null },
  ] satisfies Partial<Dependencies>[]) {
    const context = setup(overrides)
    assert.equal((await handleRequest(request(), context.dependencies)).status, 404)
    assert.equal(context.sent.length, 0)
  }
})

Deno.test('provider failures do not claim that a confirmation was sent', async () => {
  const context = setup({ send: async () => { throw new Error('private email provider failure') } })
  const response = await handleRequest(request(), context.dependencies)
  assert.equal(response.status, 502)
  assert.ok(!(await response.text()).includes('private'))
})
