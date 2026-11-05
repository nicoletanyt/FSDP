import assert from 'node:assert/strict'
import { cryptoProvider, getStripe } from '../_shared/stripe.ts'
import { handleRequest as checkout } from '../create-checkout-session/handler.ts'
import { handleRequest as webhook } from '../stripe-webhook/handler.ts'

const environment = {
  STRIPE_SECRET_KEY: 'sk_test_unit_test_only',
  STRIPE_WEBHOOK_SECRET: 'whsec_unit_test_only',
  STRIPE_MEMBERSHIP_PRICE_ID: 'price_membership',
  APP_URL: 'http://localhost:5173',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'unit_test_anon',
  SUPABASE_SERVICE_ROLE_KEY: 'unit_test_service_role',
}
const userId = '00000000-0000-4000-8000-0000000000a1'
const studentId = '00000000-0000-4000-8000-0000000000b1'
const retryKey = '00000000-0000-4000-8000-000000000001'

type Call = { method: string; path: string; key: string | null; body: string }

// Fake Stripe and Supabase. `state` lets each step change what they return.
function installFakes(state: {
  role?: string
  status?: string
  price?: Record<string, unknown>
  session?: Record<string, unknown>
}) {
  const calls: Call[] = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const url = new URL(request.url)
    calls.push({
      method: request.method, path: url.pathname,
      key: request.headers.get('idempotency-key'), body: await request.text(),
    })
    if (url.origin === 'https://api.stripe.com') {
      if (url.pathname === '/v1/prices/price_membership') {
        return Response.json({ id: 'price_membership', object: 'price', active: true, type: 'one_time',
          currency: 'sgd', unit_amount: 8000, livemode: false, ...state.price })
      }
      if (url.pathname === '/v1/checkout/sessions' && request.method === 'POST') {
        return Response.json({ id: 'cs_test_membership', object: 'checkout.session',
          url: 'https://checkout.stripe.com/c/pay/membership' })
      }
      if (url.pathname === '/v1/checkout/sessions/cs_test_membership') {
        return Response.json({ id: 'cs_test_membership', object: 'checkout.session', mode: 'payment',
          payment_status: 'paid', amount_total: 8000, currency: 'sgd', client_reference_id: studentId,
          metadata: { membership_student_id: studentId }, ...state.session })
      }
    }
    if (url.origin === environment.SUPABASE_URL) {
      if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, aud: 'authenticated' })
      if (url.pathname === '/rest/v1/users') return Response.json({ role: state.role ?? 'student' })
      if (url.pathname === '/rest/v1/rpc/submit_membership_application') {
        return Response.json([{ student_id: studentId, membership_status: state.status ?? 'pending' }])
      }
      if (url.pathname === '/rest/v1/rpc/finalize_membership_checkout') return new Response(null, { status: 204 })
      if (url.pathname === '/rest/v1/payments' && request.method === 'POST') return new Response(null, { status: 201 })
    }
    throw new Error(`Unexpected external request: ${request.method} ${request.url}`)
  }
  return { calls, restore: () => { globalThis.fetch = originalFetch } }
}

const application = {
  first_name: 'Jess', last_name: 'Tan', phone: '91234567', date_of_birth: '2004-05-06',
  home_centre_id: '00000000-0000-4000-8000-0000000000c1',
  emergency_contact: { name: 'Mum', relationship: 'Mother', phone: '90000000' },
  medical_details: '', membership_status: 'active', price: 'price_attacker', success_url: 'https://attacker.test',
}

function checkoutRequest(options: { body?: unknown; headers?: Record<string, string>; method?: string } = {}) {
  return new Request('http://localhost/functions/v1/create-checkout-session', {
    method: options.method ?? 'POST',
    headers: options.headers ?? {
      origin: environment.APP_URL, authorization: 'Bearer unit-test-token', 'idempotency-key': retryKey,
    },
    body: options.method && options.method !== 'POST' ? undefined : JSON.stringify(options.body ?? application),
  })
}

async function signedEvent(metadata: Record<string, string>) {
  const body = JSON.stringify({ id: 'evt_membership', object: 'event', type: 'checkout.session.completed',
    livemode: false, data: { object: { id: 'cs_test_membership', mode: 'payment', payment_status: 'paid', metadata } } })
  const signature = await getStripe().webhooks.generateTestHeaderStringAsync({
    payload: body, secret: environment.STRIPE_WEBHOOK_SECRET, cryptoProvider,
  })
  return new Request('http://localhost/functions/v1/stripe-webhook', {
    method: 'POST', headers: { 'stripe-signature': signature }, body,
  })
}

Deno.test('membership checkout and activation', async (test) => {
  const previous = new Map(Object.keys(environment).map((name) => [name, Deno.env.get(name)]))
  for (const [name, value] of Object.entries(environment)) Deno.env.set(name, value)
  const state: Parameters<typeof installFakes>[0] = {}
  const fakes = installFakes(state)
  const reset = () => {
    fakes.calls.length = 0
    for (const key of Object.keys(state) as (keyof typeof state)[]) delete state[key]
  }

  try {
    await test.step('CORS preflight, bad origin, method, and retry key stop before any external call', async () => {
      reset()
      const preflight = await checkout(checkoutRequest({ method: 'OPTIONS' }))
      assert.equal(preflight.status, 204)
      assert.ok(preflight.headers.get('access-control-allow-headers')?.includes('idempotency-key'))
      assert.equal((await checkout(checkoutRequest({ headers: { origin: 'https://attacker.test' } }))).status, 403)
      assert.equal((await checkout(checkoutRequest({ method: 'GET' }))).status, 405)
      assert.equal((await checkout(checkoutRequest({ headers: { origin: environment.APP_URL } }))).status, 400)
      assert.equal(fakes.calls.length, 0)
    })

    await test.step('non-students and incomplete applications never reach Stripe', async () => {
      reset()
      state.role = 'instructor'
      assert.equal((await checkout(checkoutRequest())).status, 403)
      reset()
      assert.equal((await checkout(checkoutRequest({ body: { ...application, date_of_birth: 'soon' } }))).status, 400)
      assert.ok(fakes.calls.every((call) => !call.path.startsWith('/v1/')))
    })

    await test.step('creates a Checkout session with server pricing, the student id, and the retry key', async () => {
      reset()
      const response = await checkout(checkoutRequest())
      assert.equal(response.status, 200)
      assert.equal((await response.json()).url, 'https://checkout.stripe.com/c/pay/membership')
      const submitted = JSON.parse(fakes.calls.find((c) => c.path.endsWith('submit_membership_application'))!.body)
      assert.equal(submitted.auth_user, userId)
      assert.equal(submitted.application.membership_status, undefined)
      assert.equal(submitted.application.price, undefined)
      const create = fakes.calls.find((c) => c.path === '/v1/checkout/sessions')!
      const body = new URLSearchParams(create.body)
      assert.equal(body.get('line_items[0][price]'), 'price_membership')
      assert.equal(body.get('line_items[0][quantity]'), '1')
      assert.equal(body.get('metadata[membership_student_id]'), studentId)
      assert.equal(body.get('client_reference_id'), studentId)
      assert.equal(body.get('success_url'), `${environment.APP_URL}/dashboard?checkout=success`)
      assert.equal(body.get('cancel_url'), `${environment.APP_URL}/apply-membership?checkout=cancel`)
      assert.equal(create.key, `membership-${studentId}-${retryKey}`)
      const pending = fakes.calls.find((c) => c.path === '/rest/v1/payments')!
      assert.deepEqual(JSON.parse(pending.body), {
        student_id: studentId, item: 'Membership', description: 'Membership fee',
        amount_cents: 8000, currency: 'sgd', stripe_session_id: 'cs_test_membership',
      })
    })

    await test.step('active members and misconfigured prices are refused', async () => {
      reset()
      state.status = 'active'
      assert.equal((await checkout(checkoutRequest())).status, 409)
      reset()
      state.price = { livemode: true }
      assert.equal((await checkout(checkoutRequest())).status, 500)
      assert.ok(!fakes.calls.some((c) => c.path === '/v1/checkout/sessions'))
    })

    await test.step('a verified paid membership session activates the student', async () => {
      reset()
      const response = await webhook(await signedEvent({ membership_student_id: studentId }))
      assert.equal(response.status, 200)
      const finalize = fakes.calls.filter((c) => c.path.endsWith('finalize_membership_checkout'))
      assert.equal(finalize.length, 1)
      assert.deepEqual(JSON.parse(finalize[0].body), {
        student: studentId, stripe_session: 'cs_test_membership', paid_amount: 8000, paid_currency: 'sgd',
      })
    })

    await test.step('wrong amount, unpaid, or mismatched student never activates', async () => {
      for (const session of [
        { amount_total: 100 },
        { payment_status: 'unpaid' },
        { metadata: { membership_student_id: '00000000-0000-4000-8000-0000000000ff' } },
        { client_reference_id: '00000000-0000-4000-8000-0000000000ff' },
      ]) {
        reset()
        state.session = session
        assert.equal((await webhook(await signedEvent({ membership_student_id: studentId }))).status, 400)
        assert.ok(!fakes.calls.some((c) => c.path.endsWith('finalize_membership_checkout')))
      }
    })
  } finally {
    fakes.restore()
    for (const [name, value] of previous) {
      if (value === undefined) Deno.env.delete(name)
      else Deno.env.set(name, value)
    }
  }
})
