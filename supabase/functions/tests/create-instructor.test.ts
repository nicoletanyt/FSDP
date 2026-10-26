import assert from 'node:assert/strict'
import { handleRequest } from '../create-instructor/handler.ts'

Deno.test('Instructor provisioning authorization', async (test) => {
  const environment = {
    APP_URL: 'https://app.example.test',
    AUTH_ALLOWED_ORIGINS: 'http://localhost:5173',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'unit-test-public-key',
    SUPABASE_SERVICE_ROLE_KEY: 'unit-test-service-role-key',
  }
  const originalEnvironment = new Map(
    Object.keys(environment).map((name) => [name, Deno.env.get(name)]),
  )
  const originalFetch = globalThis.fetch
  const calls: { path: string; authorization: string | null; body: unknown }[] = []
  let role = 'administrator'
  let invalidToken = false
  let missingProfile = false
  let creationFails = false

  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value)

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    assert.equal(url.origin, environment.SUPABASE_URL)
    const text = await request.text()
    calls.push({
      path: url.pathname,
      authorization: request.headers.get('authorization'),
      body: text ? JSON.parse(text) : null,
    })
    if (url.pathname === '/auth/v1/user') {
      return invalidToken
        ? Response.json({ message: 'Invalid token' }, { status: 401 })
        : Response.json({
          id: 'caller-id', email: 'caller@example.test',
          app_metadata: { role: 'administrator' },
        })
    }
    if (url.pathname === '/rest/v1/users') {
      assert.equal(url.searchParams.get('id'), 'eq.caller-id')
      assert.equal(request.headers.get('authorization'), 'Bearer caller-token')
      return missingProfile
        ? Response.json({ message: 'No profile' }, { status: 406 })
        : Response.json({ role })
    }
    assert.equal(url.pathname, '/auth/v1/admin/users')
    assert.equal(request.method, 'POST')
    return creationFails
      ? Response.json({ message: 'Email already registered' }, { status: 422 })
      : Response.json({ id: 'instructor-id', email: 'instructor@example.test' })
  }

  const details = {
    first_name: ' New ', last_name: ' Instructor ',
    email: 'INSTRUCTOR@example.test',
    role: 'administrator',
  }
  function request(options: RequestInit = {}) {
    return new Request('https://project.supabase.co/functions/v1/create-instructor', {
      method: 'POST',
      headers: { origin: environment.APP_URL, authorization: 'Bearer caller-token' },
      body: JSON.stringify(details),
      ...options,
    })
  }

  try {
    await test.step('allows a configured development origin without weakening authentication', async () => {
      calls.length = 0
      const response = await handleRequest(request({
        method: 'OPTIONS', body: null, headers: { origin: 'http://localhost:5173' },
      }))
      assert.equal(response.status, 204)
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173')
      assert.equal((await handleRequest(request({ headers: {} }))).status, 401)
      assert.equal(calls.length, 0)
    })

    await test.step('rejects invalid tokens before profile lookup or privileged API calls', async () => {
      calls.length = 0
      invalidToken = true
      assert.equal((await handleRequest(request())).status, 401)
      invalidToken = false
      assert.deepEqual(calls.map((call) => call.path), ['/auth/v1/user'])
    })

    await test.step('students and instructors cannot provision accounts even with administrator claims', async () => {
      for (const deniedRole of ['student', 'instructor']) {
        role = deniedRole
        calls.length = 0
        assert.equal((await handleRequest(request())).status, 403)
        assert.ok(!calls.some((call) => call.path === '/auth/v1/admin/users'))
      }
      role = 'administrator'
    })

    await test.step('administrators can create only instructors, regardless of the supplied role', async () => {
      calls.length = 0
      const response = await handleRequest(request())
      assert.equal(response.status, 201)
      const provision = calls.find((call) => call.path === '/auth/v1/admin/users')!
      assert.equal(provision.authorization, `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`)
      const body = provision.body as Record<string, unknown>
      assert.deepEqual(body.app_metadata, { role: 'instructor' })
      assert.deepEqual(body.user_metadata, { first_name: 'New', last_name: 'Instructor' })
      assert.equal(body.email, 'instructor@example.test')
      assert.equal(body.email_confirm, true)
      const result = await response.json()
      assert.equal(result.id, 'instructor-id')
      assert.equal(result.email, 'instructor@example.test')
      assert.equal(result.password, body.password)
      assert.ok(result.password.length >= 24)
      assert.match(result.password, /[a-z]/)
      assert.match(result.password, /[A-Z]/)
      assert.match(result.password, /\d/)
      assert.match(result.password, /[^a-zA-Z0-9]/)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    })

    await test.step('generates distinct passwords server-side and ignores supplied passwords', async () => {
      calls.length = 0
      const passwords = []
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await handleRequest(request({
          body: JSON.stringify({ ...details, password: 'client-supplied-password' }),
        }))
        assert.equal(response.status, 201)
        const result = await response.json()
        passwords.push(result.password)
        assert.notEqual(result.password, 'client-supplied-password')
      }
      assert.notEqual(passwords[0], passwords[1])
      const provisions = calls.filter((call) => call.path === '/auth/v1/admin/users')
      assert.equal((provisions[0].body as Record<string, unknown>).password, passwords[0])
      assert.equal((provisions[1].body as Record<string, unknown>).password, passwords[1])
    })

    await test.step('invalid account details and malformed JSON do not reach the privileged API', async () => {
      calls.length = 0
      for (const body of [
        '{',
        JSON.stringify({ ...details, last_name: 'a'.repeat(101) }),
        JSON.stringify({ ...details, first_name: ' ' }),
        JSON.stringify({ ...details, email: 'invalid-email' }),
      ]) {
        assert.equal((await handleRequest(request({ body }))).status, 400)
      }
      assert.ok(!calls.some((call) => call.path === '/auth/v1/admin/users'))
    })

    await test.step('missing profiles fail closed and duplicate emails return a safe error', async () => {
      calls.length = 0
      missingProfile = true
      assert.equal((await handleRequest(request())).status, 500)
      assert.ok(!calls.some((call) => call.path === '/auth/v1/admin/users'))
      missingProfile = false
      creationFails = true
      const response = await handleRequest(request())
      assert.equal(response.status, 400)
      const failedPassword = (calls.find((call) => call.path === '/auth/v1/admin/users')!.body as Record<string, unknown>).password
      const errorBody = await response.text()
      assert.ok(!errorBody.includes(String(failedPassword)))
      assert.ok(!('password' in JSON.parse(errorBody)))
      creationFails = false
    })

    await test.step('rejects unsupported origins and methods without contacting Supabase', async () => {
      calls.length = 0
      assert.equal((await handleRequest(request({ headers: { origin: 'https://attacker.test' } }))).status, 403)
      assert.equal((await handleRequest(request({ method: 'GET', body: null }))).status, 405)
      assert.equal(calls.length, 0)
    })
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of originalEnvironment) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})
