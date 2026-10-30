import { cryptoProvider, getStripe, requireEnv } from '../_shared/stripe.ts'

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
