import { adminClient, authenticate, gradingHeaders } from '../_shared/grading.ts'
import { getStripe } from '../_shared/stripe.ts'

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = {}
  try {
    const config = gradingHeaders(request)
    headers = config.headers
    if (!config.allowed) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers })
    const user = await authenticate(request, 'student')
    if (!user) return Response.json({ error: 'Student sign-in required.' }, { status: 403, headers })
    const body = await request.json()
    if (typeof body?.event_id !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(body.event_id)) {
      return Response.json({ error: 'Select a grading event.' }, { status: 400, headers })
    }
    const stripe = getStripe()
    const db = adminClient()
    const { data: attempts, error } = await db.rpc('reserve_grading_checkout', { target_event: body.event_id, auth_user: user })
    if (error || !attempts?.length) return Response.json({ error: 'Grading unavailable or you are ineligible.' }, { status: 403, headers })
    const attempt = attempts[0]
    // The SOP fee for this grade, fixed on the attempt by the database.
    if (!Number.isInteger(attempt.amount) || attempt.amount <= 0) throw new Error('Grading fee missing for attempt.')
    const { data: grade } = await db.from('grades').select('label').eq('id', attempt.target_grade).maybeSingle()
    let revision: number = attempt.revision
    if (attempt.checkout_session) {
      const existing = await stripe.checkout.sessions.retrieve(attempt.checkout_session)
      if (existing.status === 'open' && existing.url) return Response.json({ url: existing.url }, { headers })
      if (existing.payment_status === 'paid') return Response.json({ error: 'Payment is being confirmed. Refresh the grading page.' }, { status: 409, headers })
      if (existing.status !== 'expired') return Response.json({ error: 'Checkout is still processing. Try again shortly.' }, { status: 409, headers })
      const { data: next, error: retryError } = await db.rpc('retry_grading_checkout', {
        attempt: attempt.attempt_id, expired_session: existing.id,
      })
      if (retryError) return Response.json({ error: 'Checkout changed. Refresh and retry.' }, { status: 409, headers })
      revision = next
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'sgd', unit_amount: attempt.amount,
          product_data: { name: `Grading fee${grade?.label ? ` — ${grade.label}` : ''}` },
        },
      }],
      client_reference_id: attempt.attempt_id,
      metadata: { grading_attempt_id: attempt.attempt_id },
      success_url: `${config.appOrigin}/grading?checkout=success`,
      cancel_url: `${config.appOrigin}/grading?checkout=cancel`,
    }, { idempotencyKey: `grading-${attempt.attempt_id}-${revision}` })
    if (!session.url) throw new Error('Missing Stripe Checkout URL.')
    const { data: saved, error: saveError } = await db.from('grading_checkout_attempts').update({ stripe_session_id: session.id })
      .eq('id', attempt.attempt_id).eq('checkout_revision', revision).is('stripe_session_id', null).select('id').maybeSingle()
    if (saveError) throw saveError
    if (!saved) {
      const { data: current } = await db.from('grading_checkout_attempts').select('stripe_session_id').eq('id', attempt.attempt_id).single()
      if (current?.stripe_session_id !== session.id) throw new Error('Concurrent checkout conflict.')
    }
    return Response.json({ url: session.url }, { headers })
  } catch (error) {
    console.error('Grading checkout failed:', error)
    return Response.json({ error: 'Unable to start grading checkout.' }, { status: 500, headers })
  }
}
