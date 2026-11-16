import { resolveMembershipFee } from '../_shared/membership-fees.ts'
import { adminClient, authenticate, gradingHeaders } from '../_shared/grading.ts'
import { getStripe } from '../_shared/stripe.ts'

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = {}

  try {
    const config = gradingHeaders(request)
    headers = config.headers

    if (!config.allowed) {
      return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    if (request.method !== 'POST') {
      return Response.json(
        { error: 'Method not allowed.' },
        { status: 405, headers: { ...headers, Allow: 'POST, OPTIONS' } },
      )
    }

    const user = await authenticate(request, 'student')
    if (!user) {
      return Response.json({ error: 'Student sign-in required.' }, { status: 403, headers })
    }

    const idempotencyKey = request.headers.get('idempotency-key')
    if (!idempotencyKey || !UUID_PATTERN.test(idempotencyKey)) {
      return Response.json(
        { error: 'A UUID Idempotency-Key header is required.' },
        { status: 400, headers },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body.feeId !== 'string') {
      return Response.json({ error: 'Select a membership fee.' }, { status: 400, headers })
    }

    const fee = resolveMembershipFee(body.feeId)
    if (!fee) {
      return Response.json(
        { error: 'That membership fee is not available.' },
        { status: 400, headers },
      )
    }

    // The membership lives on the student record; a credit-only account has to
    // finish the membership application first so the webhook has a row to extend.
    const db = adminClient()
    const { data: students, error: studentError } = await db
      .from('students')
      .select('id')
      .eq('user_id', user)
      .limit(1)
    if (studentError) throw studentError
    const studentId = students?.[0]?.id
    if (!studentId) {
      return Response.json(
        { error: 'Complete your membership application before paying a membership fee.' },
        { status: 400, headers },
      )
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'sgd',
          unit_amount: fee.priceCents,
          product_data: {
            name: fee.title,
            description: `${fee.months} months of membership`,
          },
        },
      }],
      client_reference_id: studentId,
      metadata: {
        membership_fee: 'true',
        membership_fee_id: fee.id,
        membership_fee_months: String(fee.months),
        membership_fee_student_id: studentId,
      },
      success_url: `${config.appOrigin}/student/credits?membership=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appOrigin}/student/credits?membership=cancel`,
    }, {
      idempotencyKey: `membership-fee-${user}-${idempotencyKey}`,
    })

    if (!session.url) throw new Error('Stripe did not return a Checkout URL.')

    // Show the attempt in payment history; the webhook later marks it paid.
    // A retried request returns the same session, so the insert is skipped.
    const { error: paymentError } = await db.from('payments').upsert({
      student_id: studentId,
      item: 'Membership',
      description: fee.title,
      amount_cents: fee.priceCents,
      currency: 'sgd',
      stripe_session_id: session.id,
    }, { onConflict: 'stripe_session_id', ignoreDuplicates: true })
    if (paymentError) console.error('Could not record pending membership payment:', paymentError)

    return Response.json({ url: session.url }, { headers })
  } catch (error) {
    console.error('Membership fee checkout failed:', error)
    return Response.json({ error: 'Unable to start membership checkout.' }, { status: 500, headers })
  }
}
