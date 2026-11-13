import assert from 'node:assert/strict'
import { handleRequest } from '../create-instructor/handler.ts'

Deno.test('Instructor provisioning authorization', async (test) => {
  const environment = {
    APP_URL: 'https://app.example.test',
    AUTH_ALLOWED_ORIGINS: 'http://localhost:5173',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'unit-test-public-key',
    SUPABASE_SERVICE_ROLE_KEY: 'unit-test-service-role-key',
    EMAILJS_SERVICE_ID: 'test-service',
    EMAILJS_TEMPLATE_ID: 'test-template',
    EMAILJS_PUBLIC_KEY: 'test-public-key',
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
  let gradeExists = true
  let mailStatus = 200
  let mailUnavailable = false
  let templateAvailable = true
  let template = {
    subject: 'Your Aikido Shinju-Kai instructor login',
    body: 'Hello {{first_name}},\nSign in: {{login_url}}\nUsername: {{email}}\nPassword: {{password}}',
  }

  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value)

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    const text = await request.text()
    if (url.hostname === 'api.emailjs.com') {
      calls.push({ path: url.pathname, authorization: null, body: text ? JSON.parse(text) : null })
      if (mailUnavailable) throw new Error('EmailJS outcome unavailable')
      return new Response(mailStatus === 200 ? 'OK' : 'Rejected', { status: mailStatus })
    }
    assert.equal(url.origin, environment.SUPABASE_URL)
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
    if (url.pathname === '/rest/v1/grades') {
      assert.equal(request.headers.get('authorization'), `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`)
      const id = url.searchParams.get('id')?.replace(/^eq\./, '')
      return Response.json(gradeExists ? { id, is_ranked: id !== 'unranked' } : null)
    }
    if (url.pathname === '/rest/v1/admin_email_templates') {
      assert.equal(request.headers.get('authorization'), `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`)
      assert.equal(url.searchParams.get('id'), 'eq.instructor_account')
      return templateAvailable ? Response.json(template) : Response.json({ message: 'Missing template' }, { status: 406 })
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
    grade_id: '1st-dan', instructor_title: 'none',
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
      assert.deepEqual(body.app_metadata, { role: 'instructor', instructor_grade_id: '1st-dan', instructor_title: 'none', instructor_is_examiner: false })
      assert.deepEqual(body.user_metadata, { first_name: 'New', last_name: 'Instructor' })
      assert.equal(body.email, 'instructor@example.test')
      assert.equal(body.email_confirm, true)
      const mail = calls.find((call) => call.path === '/api/v1.0/email/send')!
      const payload = mail.body as Record<string, unknown>
      const params = payload.template_params as Record<string, string>
      assert.equal(payload.template_id, environment.EMAILJS_TEMPLATE_ID)
      assert.equal(params.to_email, 'instructor@example.test')
      assert.equal(params.email_subject, 'Your Aikido Shinju-Kai instructor login')
      assert.ok(!('bcc_emails' in params))
      const result = await response.json()
      assert.equal(result.id, 'instructor-id')
      assert.equal(result.email, 'instructor@example.test')
      assert.equal(result.password, body.password)
      assert.ok(result.password.length >= 24)
      assert.match(result.password, /[a-z]/)
      assert.match(result.password, /[A-Z]/)
      assert.match(result.password, /\d/)
      assert.match(result.password, /[^a-zA-Z0-9]/)
      assert.equal(result.email_status, 'accepted')
      assert.ok(params.email_body.includes('https://app.example.test/staff/login'))
      assert.ok(params.email_body.includes('Username: instructor@example.test'))
      assert.ok(params.email_body.includes(`Password: ${result.password}`))
      assert.equal(response.headers.get('cache-control'), 'no-store')
    })

    await test.step('uses edited administrator wording and substitutes account details once', async () => {
      calls.length = 0
      template = {
        subject: 'Your new staff access',
        body: 'Hi {{first_name}} — {{login_url}} | {{email}} | {{password}}',
      }
      const response = await handleRequest(request())
      assert.equal(response.status, 201)
      const { password } = await response.json()
      const mail = calls.find(call => call.path === '/api/v1.0/email/send')!
      const params = (mail.body as { template_params: { email_subject: string; email_body: string } }).template_params
      assert.equal(params.email_subject, template.subject)
      assert.equal(params.email_body, `Hi New — https://app.example.test/staff/login | instructor@example.test | ${password}`)
      template = {
        subject: 'Your Aikido Shinju-Kai instructor login',
        body: 'Hello {{first_name}},\nSign in: {{login_url}}\nUsername: {{email}}\nPassword: {{password}}',
      }
    })

    await test.step('does not create an account when the instructor template is missing or invalid', async () => {
      calls.length = 0
      templateAvailable = false
      const missing = await handleRequest(request())
      assert.equal(missing.status, 503)
      assert.ok(!calls.some(call => call.path === '/auth/v1/admin/users'))
      templateAvailable = true
      template = { subject: 'Missing password', body: 'Hello {{first_name}} {{login_url}} {{email}}' }
      calls.length = 0
      const invalid = await handleRequest(request())
      assert.equal(invalid.status, 503)
      assert.ok(!calls.some(call => call.path === '/auth/v1/admin/users'))
      template = {
        subject: 'Your Aikido Shinju-Kai instructor login',
        body: 'Hello {{first_name}},\nSign in: {{login_url}}\nUsername: {{email}}\nPassword: {{password}}',
      }
    })

    await test.step('reports rejection or uncertain delivery without hiding the created account', async () => {
      calls.length = 0
      mailStatus = 422
      const rejected = await handleRequest(request())
      assert.equal(rejected.status, 201)
      assert.equal((await rejected.json()).email_status, 'failed')
      assert.equal(calls.filter(call => call.path === '/auth/v1/admin/users').length, 1)
      mailStatus = 200
      calls.length = 0
      mailUnavailable = true
      const uncertain = await handleRequest(request())
      assert.equal(uncertain.status, 201)
      assert.equal((await uncertain.json()).email_status, 'uncertain')
      assert.equal(calls.filter(call => call.path === '/auth/v1/admin/users').length, 1)
      mailUnavailable = false
    })

    await test.step('does not create an account without email delivery configuration', async () => {
      calls.length = 0
      Deno.env.delete('EMAILJS_TEMPLATE_ID')
      const response = await handleRequest(request())
      assert.equal(response.status, 503)
      assert.ok(!calls.some(call => call.path === '/auth/v1/admin/users'))
      Deno.env.set('EMAILJS_TEMPLATE_ID', environment.EMAILJS_TEMPLATE_ID)
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

    await test.step('requires an existing ranked grade before passing it as trusted metadata', async () => {
      calls.length = 0
      const response = await handleRequest(request({ body: JSON.stringify({ ...details, grade_id: '2nd-dan' }) }))
      assert.equal(response.status, 201)
      const provision = calls.find((call) => call.path === '/auth/v1/admin/users')!
      assert.deepEqual((provision.body as Record<string, unknown>).app_metadata,
        { role: 'instructor', instructor_grade_id: '2nd-dan', instructor_title: 'none', instructor_is_examiner: false })
      for (const grade_id of [undefined, null, '', '  ', 7]) {
        calls.length = 0
        assert.equal((await handleRequest(request({ body: JSON.stringify({ ...details, grade_id }) }))).status, 400)
        assert.ok(!calls.some((call) => call.path === '/auth/v1/admin/users'))
      }
      calls.length = 0
      assert.equal((await handleRequest(request({ body: JSON.stringify({ ...details, grade_id: 'unranked' }) }))).status, 400)
      assert.ok(!calls.some((call) => call.path === '/auth/v1/admin/users'))
      calls.length = 0
      gradeExists = false
      assert.equal((await handleRequest(request({ body: JSON.stringify({ ...details, grade_id: 'missing' }) }))).status, 400)
      assert.ok(!calls.some((call) => call.path === '/auth/v1/admin/users'))
      gradeExists = true
    })

    await test.step('requires a title and rejects grade/title pairs the shared rules do not allow', async () => {
      for (const [grade_id, instructor_title] of [
        ['2nd-dan', 'fukushidoin'], ['4th-dan', 'shidoin'], ['4th-dan', 'fukushidoin'], ['5th-dan', 'shidoin'],
        ['6th-dan', 'shihan'], ['6th-dan', 'fukushidoin'], ['black-2nd-kyu', 'none'],
      ]) {
        calls.length = 0
        const response = await handleRequest(request({ body: JSON.stringify({ ...details, grade_id, instructor_title }) }))
        assert.equal(response.status, 201, `${grade_id} / ${instructor_title}`)
        const provision = calls.find((call) => call.path === '/auth/v1/admin/users')!
        assert.deepEqual((provision.body as Record<string, unknown>).app_metadata,
          { role: 'instructor', instructor_grade_id: grade_id, instructor_title, instructor_is_examiner: false })
      }
      for (const [grade_id, instructor_title] of [
        ['1st-dan', 'fukushidoin'], ['junior-dan', 'fukushidoin'], ['black-gold-1st-kyu', 'fukushidoin'],
        ['black-2nd-kyu', 'fukushidoin'], ['3rd-dan', 'shidoin'], ['4th-dan', 'shihan'], ['5th-dan', 'shihan'],
      ]) {
        calls.length = 0
        const response = await handleRequest(request({ body: JSON.stringify({ ...details, grade_id, instructor_title }) }))
        assert.equal(response.status, 400, `${grade_id} / ${instructor_title}`)
        assert.match((await response.json()).error, /requires \d+(st|nd|rd|th) dan or above/)
        assert.ok(!calls.some((call) => call.path === '/auth/v1/admin/users'))
      }
      for (const instructor_title of [undefined, null, '', 'Dojo-cho', 'Shihan', 7]) {
        calls.length = 0
        assert.equal((await handleRequest(request({ body: JSON.stringify({ ...details, instructor_title }) }))).status, 400)
        assert.ok(!calls.some((call) => call.path === '/auth/v1/admin/users'))
      }
    })

    await test.step('passes the examiner flag as trusted metadata and rejects non-boolean values', async () => {
      for (const is_examiner of [true, false]) {
        calls.length = 0
        const response = await handleRequest(request({ body: JSON.stringify({ ...details, is_examiner }) }))
        assert.equal(response.status, 201)
        const provision = calls.find((call) => call.path === '/auth/v1/admin/users')!
        assert.equal((provision.body as { app_metadata: Record<string, unknown> }).app_metadata.instructor_is_examiner, is_examiner)
      }
      for (const is_examiner of ['true', 1, 'yes', {}]) {
        calls.length = 0
        assert.equal((await handleRequest(request({ body: JSON.stringify({ ...details, is_examiner }) }))).status, 400)
        assert.ok(!calls.some((call) => call.path === '/auth/v1/admin/users'))
      }
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
      assert.ok(!calls.some(call => call.path === '/api/v1.0/email/send'))
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
