import { resolveCreditPass } from '../_shared/credit-passes.ts'
import { adminClient, authenticate, gradingHeaders } from '../_shared/grading.ts'
import { getStripe } from '../_shared/stripe.ts'
import { requireEnv } from '../_shared/stripe.ts'

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
    if (!body || typeof body.passId !== 'string') {
      return Response.json({ error: 'Select a class pass.' }, { status: 400, headers })
    }

    // A browser-provided membership type cannot unlock a discounted or non-member pass.
    const { data: students, error: studentError } = await adminClient()
      .from('students').select('membership_status').eq('user_id', user).limit(1)
    if (studentError) throw studentError
    const status = students?.[0]?.membership_status
    if (status && status !== 'active' && status !== 'non_member') {
      return Response.json({ error: 'Class passes require an active membership.' }, { status: 403, headers })
    }
    const membershipType = !status || status === 'non_member' ? 'non_member' : 'adult'
    const { data: accounts } = await adminClient()
      .from('credit_accounts')
      .select('membership_type')
      .eq('user_id', user)
      .limit(1)
    const storedType = accounts?.[0]?.membership_type
    const resolvedType = membershipType === 'non_member' ? membershipType
      : storedType && storedType !== 'non_member' ? storedType : membershipType

    const pass = resolveCreditPass(body.passId, resolvedType)
    if (!pass) {
      return Response.json(
        { error: 'That class pass is not available for your membership.' },
        { status: 400, headers },
      )
    }

    const stripe = getStripe()
    let nonmemberPriceId: string | undefined
    if (pass.membershipType === 'non_member') {
      nonmemberPriceId = requireEnv('STRIPE_NON_MEMBERSHIP_CREDITS_FEE_ID')
      const price = await stripe.prices.retrieve(nonmemberPriceId)
      if (!price.active || price.currency !== 'sgd' || price.unit_amount !== 4000 || price.type !== 'one_time') {
        return Response.json({ error: 'The non-member credit price is not configured for SGD $40.' }, { status: 503, headers })
      }
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: nonmemberPriceId ? [{ price: nonmemberPriceId, quantity: 1 }] : [{
        quantity: 1,
        price_data: {
          currency: 'sgd',
          unit_amount: pass.amountCents,
          product_data: {
            name: pass.title,
            description: pass.unlimited
              ? 'Unlimited class pass'
              : `${pass.credits} class credits`,
          },
        },
      }],
      client_reference_id: user,
      metadata: {
        credit_pass: 'true',
        credit_pass_id: pass.id,
        credit_pass_title: pass.title,
        credit_pass_credits: String(pass.credits),
        credit_pass_unlimited: pass.unlimited ? 'true' : 'false',
        credit_membership_type: pass.membershipType,
        credit_user_id: user,
      },
      success_url: `${config.appOrigin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.appOrigin}/student/credits?checkout=cancel`,
    }, {
      idempotencyKey: `credit-checkout-${idempotencyKey}`,
    })

    if (!session.url) throw new Error('Stripe did not return a Checkout URL.')

    return Response.json({ url: session.url }, { headers })
  } catch (error) {
    console.error('Credit checkout failed:', error)
    return Response.json({ error: 'Unable to start credit checkout.' }, { status: 500, headers })
  }
}
