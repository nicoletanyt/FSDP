import { supabase } from './supabase'

// Reuse the same key when retrying the same checkout attempt.
export async function startCheckout(idempotencyKey: string = crypto.randomUUID()) {
  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    'create-checkout-session',
    {
      body: {},
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  )

  if (error) {
    throw error
  }

  if (!data || typeof data.url !== 'string' || !data.url) {
    throw new Error('Stripe did not return a Checkout URL.')
  }

  window.location.assign(data.url)
}
