import assert from 'node:assert/strict'
import { resolveCreditPass } from '../_shared/credit-passes.ts'
import { handleRequest as checkout } from '../create-credit-checkout/handler.ts'
import { handleRequest as webhook } from '../stripe-webhook/handler.ts'
import { cryptoProvider, getStripe } from '../_shared/stripe.ts'

const userId = '00000000-0000-4000-8000-000000000011'

Deno.test('credit pass catalogue resolves prices and applies the student discount server-side', () => {
  assert.equal(resolveCreditPass('adult-10', 'adult')?.amountCents, 27000)
  assert.equal(resolveCreditPass('adult-10', 'student')?.amountCents, 13500)
  assert.equal(resolveCreditPass('adult-10', 'senior')?.amountCents, 27000)
  assert.equal(resolveCreditPass('adult-1y', 'adult')?.unlimited, true)
  assert.equal(resolveCreditPass('junior-1m', 'junior')?.amountCents, 15000)
  assert.equal(resolveCreditPass('junior-1m', 'adult'), null)
  assert.equal(resolveCreditPass('unknown-pass', 'adult'), null)
  assert.equal(resolveCreditPass({} as unknown, 'adult'), null)
})

Deno.test('credit checkout rejects unauthorized requests before calling Stripe', async () => {
  const before = Deno.env.get('APP_URL')
  const originalFetch = globalThis.fetch
  let calls = 0
  Deno.env.set('APP_URL', 'http://localhost:5173')
  globalThis.fetch = () => { calls++; throw new Error('External request must not occur') }
  try {
    const preflight = await checkout(new Request('http://localhost', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } }))
    assert.equal(preflight.status, 204)
    assert.ok(preflight.headers.get('access-control-allow-headers')?.includes('idempotency-key'))
    assert.equal((await checkout(new Request('http://localhost', { method: 'POST', headers: { origin: 'https://attacker.test' } }))).status, 403)
    assert.equal((await checkout(new Request('http://localhost', { method: 'POST', headers: { origin: 'http://localhost:5173' }, body: '{}' }))).status, 403)
    assert.equal(calls, 0)
  } finally {
    globalThis.fetch = originalFetch
    if (before === undefined) Deno.env.delete('APP_URL')
    else Deno.env.set('APP_URL', before)
  }
})

Deno.test('credit checkout uses the server price, ignores client amounts and sets webhook metadata', async () => {
  const environment: Record<string, string> = {
    APP_URL: 'http://localhost:5173',
    STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
    STRIPE_WEBHOOK_SECRET: 'whsec_unit_test_only',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'unit_test_anon',
    SUPABASE_SERVICE_ROLE_KEY: 'unit_test_service_role',
  }
  const original = new Map(Object.keys(environment).map((name) => [name, Deno.env.get(name)]))
  const originalFetch = globalThis.fetch
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value)

  const stripeCalls: { path: string; key: string | null; body: string }[] = []
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)

    if (url.pathname === '/auth/v1/user') {
      return Response.json({
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'student@example.test',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      })
    }

    if (url.pathname === '/rest/v1/users') {
      assert.equal(url.searchParams.get('select'), 'role')
      return Response.json({ role: 'student' })
    }

    if (url.pathname === '/rest/v1/credit_accounts') {
      return Response.json([{ membership_type: 'student' }])
    }

    if (url.hostname === 'api.stripe.com' && url.pathname === '/v1/checkout/sessions') {
      stripeCalls.push({
        path: url.pathname,
        key: request.headers.get('idempotency-key'),
        body: await request.text(),
      })
      return Response.json({
        id: 'cs_test_credit',
        object: 'checkout.session',
        url: 'https://checkout.stripe.com/c/pay/credit',
      })
    }

    throw new Error(`Unexpected external request: ${request.url}`)
  }

  try {
    const response = await checkout(new Request('http://localhost/functions/v1/create-credit-checkout', {
      method: 'POST',
      headers: {
        origin: environment.APP_URL,
        authorization: 'Bearer unit_test_jwt',
        'content-type': 'application/json',
        'idempotency-key': '00000000-0000-4000-8000-000000000002',
      },
      // Attack fields are ignored: the pass id resolves the price.
      body: JSON.stringify({
        passId: 'adult-10',
        membershipType: 'student',
        amount: 1,
        priceId: 'price_attacker',
        credits: 9999,
      }),
    }))

    assert.equal(response.status, 200)
    assert.equal((await response.json()).url, 'https://checkout.stripe.com/c/pay/credit')
    assert.equal(stripeCalls.length, 1)
    assert.equal(stripeCalls[0].key, 'credit-checkout-00000000-0000-4000-8000-000000000002')

    const body = new URLSearchParams(stripeCalls[0].body)
    assert.equal(body.get('mode'), 'payment')
    assert.equal(body.get('line_items[0][price_data][currency]'), 'sgd')
    assert.equal(body.get('line_items[0][price_data][unit_amount]'), '13500')
    assert.equal(body.get('line_items[0][quantity]'), '1')
    assert.equal(body.get('client_reference_id'), userId)
    assert.equal(body.get('metadata[credit_pass]'), 'true')
    assert.equal(body.get('metadata[credit_pass_id]'), 'adult-10')
    assert.equal(body.get('metadata[credit_pass_credits]'), '10')
    assert.equal(body.get('metadata[credit_pass_unlimited]'), 'false')
    assert.equal(body.get('metadata[credit_membership_type]'), 'student')
    assert.equal(body.get('metadata[credit_user_id]'), userId)
    assert.equal(
      body.get('success_url'),
      `${environment.APP_URL}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    )
    assert.equal(body.get('cancel_url'), `${environment.APP_URL}/student/credits?checkout=cancel`)
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of original) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})

Deno.test('verified credit webhook grants the pass once and rejects amount mismatches', async () => {
  const environment: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
    STRIPE_WEBHOOK_SECRET: 'whsec_unit_test_only',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'unit_test_service_role',
  }
  const original = new Map(Object.keys(environment).map((name) => [name, Deno.env.get(name)]))
  const originalFetch = globalThis.fetch
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value)

  let finalized = 0
  let amount = 13500
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)

    if (url.pathname === '/v1/checkout/sessions/cs_test_credit') {
      return Response.json({
        id: 'cs_test_credit',
        object: 'checkout.session',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: amount,
        currency: 'sgd',
        client_reference_id: userId,
        metadata: {
          credit_pass: 'true',
          credit_pass_id: 'adult-10',
          credit_pass_title: '10 Session Pass',
          credit_pass_credits: '10',
          credit_pass_unlimited: 'false',
          credit_membership_type: 'student',
          credit_user_id: userId,
        },
      })
    }

    if (url.pathname === '/rest/v1/rpc/finalize_credit_checkout') {
      finalized++
      const payload = await request.json()
      assert.deepEqual(payload, {
        auth_user: userId,
        stripe_session: 'cs_test_credit',
        pass_id: 'adult-10',
        pass_title: '10 Session Pass',
        credits: 10,
        unlimited: false,
        membership_type: 'student',
        paid_amount: 13500,
        paid_currency: 'sgd',
      })
      return Response.json(null)
    }

    throw new Error(`Unexpected external request: ${request.url}`)
  }

  async function signedEvent() {
    const body = JSON.stringify({
      id: 'evt_credit',
      object: 'event',
      type: 'checkout.session.completed',
      livemode: false,
      data: {
        object: {
          id: 'cs_test_credit',
          mode: 'payment',
          payment_status: 'paid',
          metadata: { credit_pass: 'true', credit_user_id: userId },
        },
      },
    })
    const signature = await getStripe().webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret: environment.STRIPE_WEBHOOK_SECRET,
      cryptoProvider,
    })
    return new Request('http://localhost/functions/v1/stripe-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body,
    })
  }

  try {
    amount = 1
    assert.equal((await webhook(await signedEvent())).status, 400)
    assert.equal(finalized, 0)

    amount = 13500
    assert.equal((await webhook(await signedEvent())).status, 200)
    assert.equal((await webhook(await signedEvent())).status, 200)
    assert.equal(finalized, 2) // The purchase row deduplicates grants in the database.
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of original) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})
