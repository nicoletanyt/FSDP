import { adminClient, authenticate, gradingHeaders } from '../_shared/grading.ts'
import { getStripe, requireEnv } from '../_shared/stripe.ts'

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

// Only fields with a database column are forwarded; the SQL function re-validates them.
function parseApplication(body: unknown) {
  if (!body || typeof body !== 'object') return null
  const input = body as Record<string, unknown>
  const contact = (input.emergency_contact ?? {}) as Record<string, unknown>
  const application = {
    first_name: text(input.first_name, 100),
    last_name: text(input.last_name, 100),
    phone: text(input.phone, 30),
    date_of_birth: text(input.date_of_birth, 10),
    home_centre_id: text(input.home_centre_id, 36),
    emergency_contact: {
      name: text(contact.name, 100),
      relationship: text(contact.relationship, 50),
      phone: text(contact.phone, 30),
    },
    medical_details: text(input.medical_details, 1000),
  }
  if (
    !application.first_name || !application.last_name ||
    !/^\d{4}-\d{2}-\d{2}$/.test(application.date_of_birth) ||
    !uuidPattern.test(application.home_centre_id) ||
    !application.emergency_contact.name || !application.emergency_contact.relationship ||
    !application.emergency_contact.phone
  ) return null
  return application
}

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = {}

  try {
    const config = gradingHeaders(request)
    headers = {
      ...config.headers,
      'Access-Control-Allow-Headers': `${config.headers['Access-Control-Allow-Headers']}, idempotency-key`,
    }
    if (!config.allowed) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed.' },
        { status: 405, headers: { ...headers, Allow: 'POST, OPTIONS' } },
      )
    }

    const idempotencyKey = request.headers.get('idempotency-key')
    if (!idempotencyKey || !uuidPattern.test(idempotencyKey)) {
      return Response.json({ error: 'A UUID Idempotency-Key header is required.' }, { status: 400, headers })
    }

    const user = await authenticate(request, 'student')
    if (!user) return Response.json({ error: 'Student sign-in required.' }, { status: 403, headers })

    const application = parseApplication(await request.json().catch(() => null))
    if (!application) {
      return Response.json({ error: 'Complete all required fields.' }, { status: 400, headers })
    }

    const stripe = getStripe()
    const price = await stripe.prices.retrieve(requireEnv('STRIPE_MEMBERSHIP_PRICE_ID'))
    if (!price.active || price.type !== 'one_time' || price.currency !== 'sgd' || !price.unit_amount || price.livemode) {
      throw new Error('Membership price is not an active SGD test-mode one-time price.')
    }

    const db = adminClient()
    const { data: rows, error } = await db.rpc('submit_membership_application', {
      auth_user: user, application,
    })
    if (error || !rows?.length) {
      console.error('Membership application rejected:', error)
      return Response.json({ error: 'We could not save your application. Check your details.' }, { status: 400, headers })
    }
    const { student_id: studentId, membership_status: status } = rows[0]
    if (status === 'active') {
      return Response.json({ error: 'Your membership is already active.' }, { status: 409, headers })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: price.id, quantity: 1 }],
      client_reference_id: studentId,
      metadata: { membership_student_id: studentId },
      success_url: `${config.appOrigin}/dashboard?checkout=success`,
      cancel_url: `${config.appOrigin}/apply-membership?checkout=cancel`,
    }, {
      idempotencyKey: `membership-${studentId}-${idempotencyKey}`,
    })

    if (!session.url) throw new Error('Stripe did not return a Checkout URL.')

    // Show the attempt in payment history; the webhook later marks it paid.
    // A retried request returns the same session, so the insert is skipped.
    const { error: paymentError } = await db.from('payments').upsert({
      student_id: studentId, item: 'Membership', description: 'Membership fee',
      amount_cents: price.unit_amount, currency: price.currency, stripe_session_id: session.id,
    }, { onConflict: 'stripe_session_id', ignoreDuplicates: true })
    if (paymentError) console.error('Could not record pending membership payment:', paymentError)

    return Response.json({ url: session.url }, { headers })
  } catch (error) {
    console.error('Membership checkout failed:', error)
    return Response.json({ error: 'Unable to start checkout.' }, { status: 500, headers })
  }
}
