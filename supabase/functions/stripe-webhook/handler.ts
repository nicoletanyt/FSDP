import { cryptoProvider, getStripe, requireEnv } from '../_shared/stripe.ts'
import { adminClient } from '../_shared/grading.ts'
import { resolveCreditPass } from '../_shared/credit-passes.ts'
import { confirmGradingPreview } from '../_shared/grading-drafts.ts'

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

    console.log(`Stripe event ${event.type} (${event.id})`)

    // Preserve membership cleanup from the deployed webhook.
    if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const session = event.data.object
      if (session.metadata?.membership_student_id) {
        const { error } = await adminClient().from('payments').delete()
          .eq('stripe_session_id', session.id).eq('status', 'pending')
        if (error) throw error
      }
      return Response.json({ received: true })
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object

      if (session.mode === 'payment' && session.payment_status === 'paid') {
        if (session.metadata?.grading_preview === 'true') {
          // Persist verified preview status without creating formal applications/payments.
          if (session.metadata.grading_draft_id) {
            await confirmGradingPreview(await stripe.checkout.sessions.retrieve(session.id))
          }
          return Response.json({ received: true })
        }
        if (session.metadata?.grading_attempt_id) {
          const verified = await stripe.checkout.sessions.retrieve(session.id)
          const db = adminClient()
          // The live grading flow fixes a per-grade fee on the checkout attempt.
          const { data: attemptRow, error: attemptError } = await db.from('grading_checkout_attempts')
            .select('amount_cents').eq('id', session.metadata.grading_attempt_id).maybeSingle()
          if (attemptError) throw attemptError
          if (verified.payment_status !== 'paid' || verified.currency !== 'sgd' || !attemptRow?.amount_cents ||
            verified.amount_total !== attemptRow.amount_cents ||
            verified.metadata?.grading_attempt_id !== session.metadata.grading_attempt_id) {
            return new Response('Grading payment mismatch.', { status: 400 })
          }
          const { error } = await db.rpc('finalize_grading_checkout', {
            attempt: verified.metadata.grading_attempt_id,
            stripe_session: session.id, paid_amount: verified.amount_total, paid_currency: verified.currency,
          })
          if (error) throw error
          return Response.json({ received: true })
        }

        if (session.metadata?.membership_student_id) {
          // Preserve the newer deployed membership flow when adding credit handling.
          const verified = await stripe.checkout.sessions.retrieve(session.id)
          const studentId = verified.metadata?.membership_student_id
          const db = adminClient()
          const { data: pending, error: pendingError } = await db.from('payments')
            .select('student_id, amount_cents').eq('stripe_session_id', session.id).maybeSingle()
          if (pendingError) throw pendingError
          const expectedAmount = pending
            ? (pending.student_id === studentId ? pending.amount_cents : null)
            : (await stripe.prices.retrieve(requireEnv('STRIPE_MEMBERSHIP_PRICE_ID'))).unit_amount
          if (verified.payment_status !== 'paid' || verified.currency !== 'sgd' ||
            !expectedAmount || verified.amount_total !== expectedAmount || !studentId ||
            studentId !== session.metadata.membership_student_id ||
            verified.client_reference_id !== studentId) {
            return new Response('Membership payment mismatch.', { status: 400 })
          }
          const { error } = await db.rpc('finalize_membership_checkout', {
            student: studentId, stripe_session: session.id,
            paid_amount: verified.amount_total, paid_currency: verified.currency,
          })
          if (error) throw error
          return Response.json({ received: true })
        }

        if (session.metadata?.credit_pass === 'true') {
          const verified = await stripe.checkout.sessions.retrieve(session.id)
          const metadata = verified.metadata ?? {}
          const credits = Number(metadata.credit_pass_credits)
          const expected = resolveCreditPass(metadata.credit_pass_id, metadata.credit_membership_type)
          const unlimited = metadata.credit_pass_unlimited === 'true'

          if (
            verified.payment_status !== 'paid' ||
            verified.currency !== 'sgd' ||
            !verified.amount_total || verified.amount_total <= 0 ||
            metadata.credit_pass !== 'true' ||
            !metadata.credit_user_id ||
            verified.client_reference_id !== metadata.credit_user_id ||
            !expected ||
            expected.amountCents !== verified.amount_total ||
            expected.credits !== credits ||
            expected.unlimited !== unlimited ||
            (metadata.credit_pass_unlimited !== 'true' && metadata.credit_pass_unlimited !== 'false')
          ) {
            return new Response('Credit payment mismatch.', { status: 400 })
          }

          const { error } = await adminClient().rpc('finalize_credit_checkout', {
            auth_user: metadata.credit_user_id,
            stripe_session: session.id,
            pass_id: expected.id,
            pass_title: expected.title,
            credits: expected.credits,
            unlimited: expected.unlimited,
            membership_type: expected.membershipType,
            paid_amount: verified.amount_total,
            paid_currency: verified.currency,
          })
          if (error) throw error
          console.log(`Credit purchase finalized (${session.id})`)
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
