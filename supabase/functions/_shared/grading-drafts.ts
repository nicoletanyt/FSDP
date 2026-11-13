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
  const { data, error } = await adminClient().from('grading_application_drafts')
    .update({ status: 'preview_paid', updated_at: new Date().toISOString() })
    .eq('id', draft).eq('user_id', session.client_reference_id)
    .eq('stripe_session_id', session.id).eq('base_fee_cents', session.amount_total!)
    .eq('target_grade_id', session.metadata.target_grade_id ?? '').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Grading preview does not match a saved draft.')
  return true
}
