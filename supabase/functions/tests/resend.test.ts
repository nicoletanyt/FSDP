import assert from 'node:assert/strict'
import { handleRequest as send } from '../send-test-notification/handler.ts'
import { handleRequest as webhook } from '../resend-webhook/handler.ts'

Deno.test('Resend test notification is admin-only and always targets the one test mailbox', async () => {
  const env = {
    APP_URL: 'https://app.example.test',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test',
    RESEND_API_KEY: 'resend-test',
    RESEND_FROM_EMAIL: 'Aikido <notifications@example.test>',
  }
  const originals = Object.fromEntries(Object.keys(env).map((name) => [name, Deno.env.get(name)]))
  const originalFetch = globalThis.fetch
  let role = 'student'
  const calls: { url: string; body: unknown }[] = []
  for (const [name, value] of Object.entries(env)) Deno.env.set(name, value)
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init)
    const url = new URL(req.url)
    const body = req.method === 'POST' ? await req.json() : null
    calls.push({ url: url.href, body })
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'admin-id', email: 'admin@example.test' })
    if (url.pathname === '/rest/v1/users') return Response.json({ role })
    if (url.pathname === '/rest/v1/notifications' && req.method === 'POST') return Response.json({ id: '11111111-1111-4111-8111-111111111111' })
    if (url.pathname === '/rest/v1/notification_recipients') return Response.json({})
    if (url.pathname === '/rest/v1/notifications') return Response.json({})
    if (url.href === 'https://api.resend.com/emails') return Response.json({ id: 'provider-1' })
    throw new Error(`Unexpected request: ${url.href}`)
  }
  const makeRequest = (body: unknown, token = 'valid-token') => new Request('https://project.supabase.co/functions/v1/send-test-notification', {
    method: 'POST',
    headers: { Origin: env.APP_URL, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  try {
    assert.equal((await send(makeRequest({ template: 'general_reminder', message: 'Test' }))).status, 403)
    assert.ok(!calls.some((call) => call.url.includes('api.resend.com')))
    role = 'administrator'
    assert.equal((await send(makeRequest({ template: 'other', message: 'Test' }))).status, 400)
    const response = await send(makeRequest({ template: 'general_reminder', message: 'Test message', to: ['stranger@example.com'] }))
    assert.equal(response.status, 200)
    const provider = calls.find((call) => call.url === 'https://api.resend.com/emails')?.body as Record<string, unknown>
    assert.deepEqual(provider.to, ['mq07110@gmail.com'])
    assert.equal(provider.text, 'Test message')
    assert.deepEqual(provider.tags, [{ name: 'notification_id', value: '11111111-1111-4111-8111-111111111111' }])
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})

Deno.test('Resend webhook rejects unsigned requests before database access', async () => {
  const previous = Deno.env.get('RESEND_WEBHOOK_SECRET')
  Deno.env.set('RESEND_WEBHOOK_SECRET', `whsec_${btoa('test-webhook-key')}`)
  try {
    const response = await webhook(new Request('https://project.supabase.co/functions/v1/resend-webhook', {
      method: 'POST', body: JSON.stringify({ type: 'email.delivered' }),
    }))
    assert.equal(response.status, 400)
  } finally {
    if (previous === undefined) Deno.env.delete('RESEND_WEBHOOK_SECRET')
    else Deno.env.set('RESEND_WEBHOOK_SECRET', previous)
  }
})

Deno.test('Resend webhook verifies signatures and records real delivery and bounce events', async () => {
  const secretKey = new TextEncoder().encode('test-webhook-key')
  const secret = `whsec_${btoa('test-webhook-key')}`
  const originalSecret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  const originalUrl = Deno.env.get('SUPABASE_URL')
  const originalServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const originalFetch = globalThis.fetch
  Deno.env.set('RESEND_WEBHOOK_SECRET', secret)
  Deno.env.set('SUPABASE_URL', 'https://project.supabase.co')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-test')
  let status = 'sent'
  const summaries: unknown[] = []
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init)
    const url = new URL(req.url)
    if (url.pathname === '/rest/v1/notification_recipients' && req.method === 'GET') {
      return Response.json({ id: 'recipient-id', status, provider_message_id: 'provider-id' })
    }
    if (url.pathname === '/rest/v1/notification_recipients' && req.method === 'PATCH') {
      const body = await req.json()
      status = body.status
      return Response.json({})
    }
    if (url.pathname === '/rest/v1/notifications' && req.method === 'PATCH') {
      summaries.push(await req.json())
      return Response.json({})
    }
    throw new Error(`Unexpected request: ${url.href}`)
  }
  const key = await crypto.subtle.importKey('raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  async function signedRequest(type: string) {
    const body = JSON.stringify({ type, data: {
      email_id: 'provider-id', to: ['mq07110@gmail.com'],
      tags: { notification_id: '11111111-1111-4111-8111-111111111111' },
    } })
    const id = `event-${crypto.randomUUID()}`
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key,
      new TextEncoder().encode(`${id}.${timestamp}.${body}`)))
    return new Request('https://project.supabase.co/functions/v1/resend-webhook', {
      method: 'POST',
      headers: { 'svix-id': id, 'svix-timestamp': timestamp,
        'svix-signature': `v1,${btoa(String.fromCharCode(...signature))}` },
      body,
    })
  }
  try {
    assert.equal((await webhook(await signedRequest('email.delivered'))).status, 200)
    assert.equal(status, 'delivered')
    assert.deepEqual(summaries[0], { delivered_count: 1, failed_count: 0 })
    assert.equal((await webhook(await signedRequest('email.bounced'))).status, 200)
    assert.equal(status, 'bounced')
    assert.deepEqual(summaries[1], { delivered_count: 0, failed_count: 1 })
    assert.equal((await webhook(await signedRequest('email.delivered'))).status, 200)
    assert.equal(summaries.length, 2)
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of [
      ['RESEND_WEBHOOK_SECRET', originalSecret],
      ['SUPABASE_URL', originalUrl],
      ['SUPABASE_SERVICE_ROLE_KEY', originalServiceKey],
    ] as const) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})
