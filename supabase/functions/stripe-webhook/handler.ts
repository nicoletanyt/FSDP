import { cryptoProvider, getStripe, requireEnv } from '../_shared/stripe.ts'
import { adminClient } from '../_shared/grading.ts'

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed.', {
      status: 405,
      headers: { Allow: 'POST' },
    })
  }

  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return new Response('Missing Stripe-Signature header.', { status: 400 })
  }

  try {
    const stripe = getStripe()
    const webhookSecret = requireEnv('STRIPE_WEBHOOK_SECRET')
    // Signature verification must use the unmodified request body.
    const body = await request.text()
    let event

    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        cryptoProvider,
      )
    } catch {
      return new Response('Invalid webhook signature.', { status: 400 })
    }

    if (event.livemode) {
      return new Response('Only test-mode events are supported.', { status: 400 })
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object

      if (session.mode === 'payment' && session.payment_status === 'paid') {
        if (session.metadata?.grading_attempt_id) {
          const verified = await stripe.checkout.sessions.retrieve(session.id)
          if (verified.payment_status !== 'paid' || verified.amount_total !== 6000 || verified.currency !== 'sgd' ||
            verified.metadata?.grading_attempt_id !== session.metadata.grading_attempt_id) {
            return new Response('Grading payment mismatch.', { status: 400 })
          }
          const { error } = await adminClient().rpc('finalize_grading_checkout', {
            attempt: verified.metadata.grading_attempt_id,
            stripe_session: session.id, paid_amount: verified.amount_total, paid_currency: verified.currency,
          })
          if (error) throw error
          return Response.json({ received: true })
        }
        if (session.metadata?.membership_student_id) {
          // Re-read the session and price from Stripe rather than trusting the event body.
          const verified = await stripe.checkout.sessions.retrieve(session.id)
          const price = await stripe.prices.retrieve(requireEnv('STRIPE_MEMBERSHIP_PRICE_ID'))
          const studentId = verified.metadata?.membership_student_id
          if (verified.payment_status !== 'paid' || verified.currency !== 'sgd' ||
            verified.amount_total !== price.unit_amount || !studentId ||
            studentId !== session.metadata.membership_student_id ||
            verified.client_reference_id !== studentId) {
            return new Response('Membership payment mismatch.', { status: 400 })
          }
          const { error } = await adminClient().rpc('finalize_membership_checkout', {
            student: studentId, stripe_session: session.id,
            paid_amount: verified.amount_total, paid_currency: verified.currency,
          })
          if (error) throw error
          return Response.json({ received: true })
        }
        // A fixed assignment stays idempotent even after Stripe's key expires.
        // Both event types use the same key, including concurrent deliveries.
        await stripe.checkout.sessions.update(session.id, {
          metadata: { checkout_payment_verified: 'true' },
        }, {
          idempotencyKey: `checkout-payment-verified-${session.id}`,
        })
      }
    }

    return Response.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook processing failed:', error)
    // Let Stripe retry transient errors; never acknowledge a failed update.
    return new Response('Webhook processing failed.', { status: 500 })
  }
}
