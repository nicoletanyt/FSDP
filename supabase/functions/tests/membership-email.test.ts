import { handleRequest, membershipMessage } from '../send-membership-email/handler.ts'
import type { Dependencies } from '../send-membership-email/handler.ts'

function assert(condition: unknown, message = 'Assertion failed'): asserts condition {
  if (!condition) throw new Error(message)
}

const member = {
  id: '00000000-0000-4000-8000-000000000001', email: 'member@example.com',
  first_name: '<img src=x onerror=alert(1)>', last_name: 'Tan & Co', member_no: 'ASJ20261234',
}
const body = { email: member.email, name: 'Browser-provided name', membershipId: member.member_no }

function setup(overrides: Partial<Dependencies> = {}) {
  const sent: { message: ReturnType<typeof membershipMessage>; key: string }[] = []
  let lookups = 0
  const dependencies: Dependencies = {
    headers: () => ({ allowed: true, headers: { 'Access-Control-Allow-Origin': 'https://example.com' } }),
    authenticate: () => Promise.resolve('owner-user'),
    loadMember: (userId: string) => {
      assert(userId === 'owner-user')
      lookups++
      return Promise.resolve(member)
    },
    send: (message: ReturnType<typeof membershipMessage>, key: string) => {
      sent.push({ message, key })
      return Promise.resolve('resend-email-one')
    },
    ...overrides,
  }
  return { sent, lookups: () => lookups, dependencies }
}

function request(payload: unknown = body) {
  return new Request('https://example.com/send-membership-email', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-token' },
    body: JSON.stringify(payload),
  })
}

Deno.test('sends the stored recipient and identity, escaped HTML, text and stable idempotency key', async () => {
  const { sent, dependencies } = setup()
  const response = await handleRequest(request(), dependencies)
  assert(response.status === 200)
  assert((await response.json()).status === 'accepted')
  assert(sent.length === 1)
  assert(sent[0].message.to === member.email)
  assert(sent[0].message.subject === 'Welcome to Aikido Shinju-Kai!')
  assert(sent[0].message.html.includes('ASJ20261234'))
  assert(sent[0].message.html.includes('&lt;img'))
  assert(!sent[0].message.html.includes('<img'))
  assert(sent[0].message.html.includes('one business day'))
  assert(sent[0].message.text.includes('Payment Instructions'))
  assert(!sent[0].message.html.includes(body.name))
  await handleRequest(request(), dependencies)
  assert(sent[0].key === sent[1].key)
})

Deno.test('preflight does not authenticate or send; rejects other origins and methods', async () => {
  const context = setup({ authenticate: () => { throw new Error('Must not authenticate preflight') } })
  assert((await handleRequest(new Request('https://example.com', { method: 'OPTIONS' }), context.dependencies)).status === 204)
  assert((await handleRequest(new Request('https://example.com'), context.dependencies)).status === 405)
  const blocked = setup({ headers: () => ({ allowed: false, headers: {}, appOrigin: 'https://example.com' }) })
  assert((await handleRequest(request(), blocked.dependencies)).status === 403)
  assert(context.sent.length === 0 && blocked.sent.length === 0)
})

Deno.test('unauthenticated callers cannot look up a member or send emails', async () => {
  const context = setup({ authenticate: () => Promise.resolve(null) })
  assert((await handleRequest(request(), context.dependencies)).status === 401)
  assert(context.lookups() === 0 && context.sent.length === 0)
})

Deno.test('rejects missing application, forged recipient and mismatched membership ID', async () => {
  const context = setup()
  for (const payload of [{ ...body, email: 'other@example.com' }, { ...body, membershipId: 'ASJ20269999' }]) {
    assert((await handleRequest(request(payload), context.dependencies)).status === 403)
  }
  assert(context.sent.length === 0)
  const missing = setup({ loadMember: () => Promise.resolve(null) })
  assert((await handleRequest(request(), missing.dependencies)).status === 404)
})

Deno.test('rejects malformed or missing fields before accessing member data', async () => {
  const context = setup()
  for (const payload of [null, [], {}, { ...body, email: 'not-an-email' }, { ...body, name: '' }, { ...body, membershipId: 123 }]) {
    assert((await handleRequest(request(payload), context.dependencies)).status === 400)
  }
  const invalid = new Request('https://example.com', { method: 'POST', body: '{' })
  assert((await handleRequest(invalid, context.dependencies)).status === 400)
  assert(context.lookups() === 0 && context.sent.length === 0)
})

Deno.test('provider and database failures return sanitized errors without claiming delivery', async () => {
  for (const overrides of [
    { send: () => Promise.reject(new Error('provider-secret member@example.com')) },
    { loadMember: () => Promise.reject(new Error('database-secret')) },
  ]) {
    const context = setup(overrides)
    const response = await handleRequest(request(), context.dependencies)
    assert(response.status === 502)
    const text = await response.text()
    assert(!text.includes('secret') && !text.includes(member.email))
  }
})
