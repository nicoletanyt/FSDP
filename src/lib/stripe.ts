import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Only fields with a database column; the server re-validates everything. */
export interface MembershipApplication {
  first_name: string
  last_name: string
  phone: string
  date_of_birth: string // YYYY-MM-DD
  home_centre_id: string
  emergency_contact: { name: string; relationship: string; phone: string }
  medical_details: string
}

/**
 * Saves the application as a pending membership, then redirects to Stripe
 * Checkout. The membership becomes active only after Stripe's verified webhook.
 * Reuse the same key when retrying the same submission.
 */
export async function startMembershipCheckout(
  application: MembershipApplication,
  idempotencyKey: string = crypto.randomUUID(),
) {
  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    'create-checkout-session',
    {
      body: application,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )

  if (error) {
    // Surface the function's safe error message (e.g. "already active").
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null)
      if (body && typeof body.error === 'string') throw new Error(body.error)
    }
    throw error
  }

  if (!data || typeof data.url !== 'string' || !data.url) {
    throw new Error('Stripe did not return a Checkout URL.')
  }

  window.location.assign(data.url)
}
