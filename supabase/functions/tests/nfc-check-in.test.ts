import assert from 'node:assert/strict'
import { handleRequest } from '../nfc-check-in/handler.ts'

Deno.test('NFC Edge Function requires an instructor session and never exposes the tag hash', async () => {
  const config = {
    APP_URL: 'https://app.example.test',
    AUTH_ALLOWED_ORIGINS: 'https://phone.example.test',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'public-test-key',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key',
  }
  const previous = Object.fromEntries(Object.keys(config).map((key) => [key, Deno.env.get(key)]))
  const originalFetch = globalThis.fetch
  for (const [key, value] of Object.entries(config)) Deno.env.set(key, value)
  const tag = 'a'.repeat(64)
  const event = '11111111-1111-4111-8111-111111111111'
  let role = 'instructor'
  let validSession = true
  let result = { status: 'marked', student_name: 'Test Student', already_marked: false }
  let rpcCalls = 0
  const request = (body: unknown, origin = 'https://phone.example.test', authorization = 'Bearer test-session') =>
    new Request('https://project.supabase.co/functions/v1/nfc-check-in', {
      method: 'POST', headers: { Origin: origin, Authorization: authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString())
    if (url.pathname === '/auth/v1/user') return Response.json(validSession ? { id: 'user-id' } : { message: 'bad token' },
      { status: validSession ? 200 : 401 })
    if (url.pathname === '/rest/v1/users') return Response.json({ role })
    if (url.pathname === '/rest/v1/rpc/nfc_scan_attendance') {
      rpcCalls++
      const body = JSON.parse(String(init?.body))
      assert.equal(body.p_actor, 'user-id')
      assert.ok(body.p_event === null || body.p_event === event)
      assert.match(body.p_tag_id, /^[0-9a-f]{64}$/)
      assert.notEqual(body.p_tag_id, tag)
      return Response.json(result)
    }
    throw new Error(`Unexpected fetch: ${url.pathname}`)
  }
  try {
    const preflight = await handleRequest(new Request('https://project.supabase.co/functions/v1/nfc-check-in', {
      method: 'OPTIONS', headers: { Origin: 'https://phone.example.test' },
    }))
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://phone.example.test')
    const lan = await handleRequest(new Request('https://project.supabase.co/functions/v1/nfc-check-in', {
      method: 'OPTIONS', headers: { Origin: 'http://192.168.1.13:5173' },
    }))
    assert.equal(lan.status, 204)
    assert.equal((await handleRequest(request({ action: 'scan', tag }, 'http://192.168.1.14:5173'))).status, 403)
    assert.equal((await handleRequest(request({ action: 'scan', tag }, 'https://evil.example.test'))).status, 403)
    assert.equal((await handleRequest(request({ action: 'scan', tag }, undefined, ''))).status, 401)
    validSession = false
    assert.equal((await handleRequest(request({ action: 'scan', tag }))).status, 401)
    validSession = true
    role = 'student'
    assert.equal((await handleRequest(request({ action: 'scan', tag }))).status, 403)
    role = 'instructor'
    assert.equal((await handleRequest(request({ action: 'manual', tag }))).status, 400)
    assert.equal((await handleRequest(request({ action: 'scan', tag: 'student-id' }))).status, 400)
    assert.equal((await handleRequest(request({ action: 'scan', tag, event_id: 'bad-id' }))).status, 400)
    assert.equal(rpcCalls, 0)
    for (const status of ['marked', 'upcoming', 'absent', 'excused', 'no_class', 'select_class']) {
      result = { status, student_name: 'Test Student', already_marked: false }
      const response = await handleRequest(request({ action: 'scan', tag, event_id: event }))
      assert.equal(response.status, 200)
      assert.equal((await response.json()).status, status)
    }
    result = { status: 'invalid', student_name: '', already_marked: false }
    assert.equal((await handleRequest(request({ action: 'scan', tag }))).status, 404)
    assert.equal(rpcCalls, 7)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
})
