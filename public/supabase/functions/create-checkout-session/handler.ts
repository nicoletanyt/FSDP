import { getStripe, requireEnv } from '../_shared/stripe.ts'

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = {}

  try {
    const appUrl = new URL(requireEnv('APP_URL'))

    if (
      !['http:', 'https:'].includes(appUrl.protocol) ||
      appUrl.pathname !== '/' || appUrl.search || appUrl.hash ||
      appUrl.username || appUrl.password
    ) {
      throw new Error('APP_URL must be an HTTP(S) origin without a path.')
    }

    const appOrigin = appUrl.origin
    headers = {
      'Access-Control-Allow-Origin': appOrigin,
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type, idempotency-key',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    }

    const origin = request.headers.get('origin')

    if (origin && origin !== appOrigin) {
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

    const idempotencyKey = request.headers.get('idempotency-key')

    const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

    if (!idempotencyKey || !uuidPattern.test(idempotencyKey)) {
      return Response.json(
        { error: 'A UUID Idempotency-Key header is required.' },
        { status: 400, headers },
      )
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: requireEnv('STRIPE_PRICE_ID'), quantity: 1 }],
      success_url: `${appOrigin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appOrigin}/checkout/cancel`,
    }, {
      idempotencyKey: `checkout-${idempotencyKey}`,
    })

    if (!session.url) {
      throw new Error('Stripe did not return a Checkout URL.')
    }

    return Response.json({ url: session.url }, { headers })
  } catch (error) {
    console.error('Checkout session creation failed:', error)
    return Response.json(
      { error: 'Unable to start checkout.' },
      { status: 500, headers },
    )
  }
}
