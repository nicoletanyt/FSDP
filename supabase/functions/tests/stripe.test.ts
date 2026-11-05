import assert from 'node:assert/strict'
import { cryptoProvider, getStripe } from '../_shared/stripe.ts'
import { handleRequest as webhook } from '../stripe-webhook/handler.ts'

// Membership checkout itself is covered in membership.test.ts.
Deno.test('Stripe webhook security', async (test) => {
  const environment = {
    STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
    STRIPE_WEBHOOK_SECRET: 'whsec_unit_test_only',
  }
  const originalEnvironment = new Map(
    Object.keys(environment).map((name) => [name, Deno.env.get(name)]),
  )
  const originalFetch = globalThis.fetch
  const calls: { path: string; key: string | null; body: string }[] = []
  let failStripe = false

  for (const [name, value] of Object.entries(environment)) {
    Deno.env.set(name, value)
  }

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    assert.equal(url.origin, 'https://api.stripe.com')
    assert.equal(request.method, 'POST')
    calls.push({
      path: url.pathname,
      key: request.headers.get('idempotency-key'),
      body: await request.text(),
    })

    if (failStripe) {
      return Response.json({
        error: { type: 'invalid_request_error', message: 'Simulated Stripe failure' },
      }, { status: 400 })
    }

    return Response.json({
      id: 'cs_test_session',
      object: 'checkout.session',
      url: 'https://checkout.stripe.com/c/pay/test_session',
    })
  }

  async function signedEvent(
    type = 'checkout.session.completed',
    options: { paid?: boolean; live?: boolean; timestamp?: number } = {},
  ) {
    const body = JSON.stringify({
      id: 'evt_unit_test',
      object: 'event',
      type,
      livemode: options.live ?? false,
      data: {
        object: {
          id: 'cs_test_session',
          mode: 'payment',
          payment_status: options.paid === false ? 'unpaid' : 'paid',
        },
      },
    })
    const signature = await getStripe().webhooks.generateTestHeaderStringAsync({
      payload: body,
      secret: environment.STRIPE_WEBHOOK_SECRET,
      cryptoProvider,
      timestamp: options.timestamp,
    })

    return new Request('http://localhost/functions/v1/stripe-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body,
    })
  }

  try {
    await test.step('rejects missing, tampered, and expired webhook signatures', async () => {
      calls.length = 0
      const unsigned = new Request('http://localhost', { method: 'POST' })
      assert.equal((await webhook(unsigned)).status, 400)
      const valid = await signedEvent()
      const tampered = new Request(valid.url, {
        method: 'POST',
        headers: valid.headers,
        body: `${await valid.text()} `,
      })
      assert.equal((await webhook(tampered)).status, 400)
      const expired = await signedEvent(undefined, {
        timestamp: Math.floor(Date.now() / 1000) - 600,
      })
      assert.equal((await webhook(expired)).status, 400)
      assert.equal(calls.length, 0)
    })

    await test.step('duplicate and concurrent payment events use one fixed update and key', async () => {
      calls.length = 0
      const events = await Promise.all([
        signedEvent(),
        signedEvent(),
        signedEvent('checkout.session.async_payment_succeeded'),
      ])
      const responses = await Promise.all(events.map(webhook))
      assert.ok(responses.every((response) => response.status === 200))
      assert.equal(calls.length, 3)
      for (const call of calls) {
        assert.equal(call.path, '/v1/checkout/sessions/cs_test_session')
        assert.equal(call.key, 'checkout-payment-verified-cs_test_session')
        assert.equal(
          new URLSearchParams(call.body).get('metadata[checkout_payment_verified]'),
          'true',
        )
        assert.deepEqual(call, calls[0])
      }
    })

    await test.step('unpaid or unrelated events do not update sessions; live events are rejected', async () => {
      calls.length = 0
      const unpaid = await signedEvent(undefined, { paid: false })
      const unrelated = await signedEvent('payment_intent.succeeded')
      const live = await signedEvent(undefined, { live: true })
      assert.equal((await webhook(unpaid)).status, 200)
      assert.equal((await webhook(unrelated)).status, 200)
      assert.equal((await webhook(live)).status, 400)
      assert.equal(calls.length, 0)
    })

    await test.step('failed processing returns 500 and the next delivery retries the same update', async () => {
      calls.length = 0
      failStripe = true
      assert.equal((await webhook(await signedEvent())).status, 500)
      failStripe = false
      assert.equal((await webhook(await signedEvent())).status, 200)
      assert.equal(calls.length, 2)
      assert.deepEqual(calls[0], calls[1])
    })
  } finally {
    globalThis.fetch = originalFetch
    for (const [name, value] of originalEnvironment) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})
