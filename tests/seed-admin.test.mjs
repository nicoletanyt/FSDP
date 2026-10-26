import assert from 'node:assert/strict'
import test from 'node:test'
import { seedAdmin } from '../scripts/seed-admin.mjs'

test('Development administrator seed security', async (suite) => {
  const environment = {
    VITE_SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'unit-test-service-role',
    ADMIN_SEED_EMAIL: 'admin@example.test',
    ADMIN_SEED_PASSWORD: 'unit-test-password-long-enough1',
  }
  const originals = new Map(Object.keys(environment).map((name) => [name, process.env[name]]))
  const originalFetch = globalThis.fetch
  const originalLog = console.log
  const logs = []
  const writes = []
  let existing = false
  let role = 'administrator'

  Object.assign(process.env, environment)
  console.log = (...values) => logs.push(values.join(' '))
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    assert.equal(url.origin, environment.VITE_SUPABASE_URL)
    assert.equal(request.headers.get('authorization'), `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`)
    if (url.pathname === '/rest/v1/users') {
      assert.equal(request.method, 'GET')
      return Response.json(url.searchParams.has('id') ? { role } : [])
    }
    assert.equal(url.pathname, '/auth/v1/admin/users')
    if (request.method === 'GET') {
      return Response.json({ users: existing ? [{ id: 'existing-admin', email: environment.ADMIN_SEED_EMAIL }] : [] })
    }
    assert.equal(request.method, 'POST')
    writes.push(await request.json())
    return Response.json({ id: 'new-admin', email: environment.ADMIN_SEED_EMAIL })
  }

  try {
    await suite.test('creates a confirmed administrator using environment credentials', async () => {
      await seedAdmin()
      assert.equal(writes.length, 1)
      assert.deepEqual(writes[0].app_metadata, { role: 'administrator' })
      assert.equal(writes[0].email_confirm, true)
      assert.equal(writes[0].password, environment.ADMIN_SEED_PASSWORD)
    })

    await suite.test('rerunning never overwrites an administrator or resets a password', async () => {
      existing = true
      writes.length = 0
      await seedAdmin()
      assert.equal(writes.length, 0)
    })

    await suite.test('never elevates a preexisting student or instructor', async () => {
      for (const existingRole of ['student', 'instructor']) {
        role = existingRole
        await assert.rejects(seedAdmin, /non-administrator/)
      }
      assert.equal(writes.length, 0)
    })

    await suite.test('requires eight characters, a letter, and a number without logging credentials', async () => {
      for (const password of ['short1', 'abcdef1', 'passwordwithoutnumbers', '12345678']) {
        process.env.ADMIN_SEED_PASSWORD = password
        await assert.rejects(seedAdmin, /8–128 characters and at least one letter and one number/)
      }
      assert.ok(!logs.join(' ').includes(environment.ADMIN_SEED_PASSWORD))
      assert.ok(!logs.join(' ').includes(environment.SUPABASE_SERVICE_ROLE_KEY))
      assert.equal(writes.length, 0)
    })

    await suite.test('accepts an eight-character password containing a number', async () => {
      process.env.ADMIN_SEED_PASSWORD = 'abcdefg1'
      existing = false
      role = 'administrator'
      await seedAdmin()
      assert.equal(writes.length, 1)
      assert.equal(writes[0].password, 'abcdefg1')
      existing = true
      writes.length = 0
    })

    await suite.test('uses the project origin even if configured with a REST endpoint URL', async () => {
      process.env.ADMIN_SEED_PASSWORD = environment.ADMIN_SEED_PASSWORD
      process.env.VITE_SUPABASE_URL = `${environment.VITE_SUPABASE_URL}/rest/v1/`
      role = 'administrator'
      await seedAdmin()
      assert.equal(writes.length, 0)
    })
  } finally {
    globalThis.fetch = originalFetch
    console.log = originalLog
    for (const [name, value] of originals) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
})
