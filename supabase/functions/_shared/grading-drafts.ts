import type Stripe from 'npm:stripe@23.0.1'
import { adminClient } from './grading.ts'

/** Only call with a session retrieved from Stripe, never client-supplied JSON. */
export async function confirmGradingPreview(session: Stripe.Checkout.Session) {
  const draft = session.metadata?.grading_draft_id
  if (!draft) return false // Older previews had no database draft.
  if (session.livemode || session.mode !== 'payment' || session.payment_status !== 'paid' ||
    session.currency !== 'sgd' || session.metadata?.grading_preview !== 'true' ||
    !session.client_reference_id || session.metadata.grading_preview_user_id !== session.client_reference_id) {
    throw new Error('Invalid grading preview payment.')
  }
  const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
  const { data, error } = await adminClient().rpc('finalize_grading_preview_payment', {
    draft, owner_user: session.client_reference_id, stripe_session: session.id,
    paid_amount: session.amount_total, paid_currency: session.currency,
    target_grade: session.metadata.target_grade_id ?? '', stripe_live: session.livemode,
    payment_intent: intent,
  })
  if (error) throw error
  if (!data) throw new Error('Grading preview does not match a saved draft.')
  return true
}
