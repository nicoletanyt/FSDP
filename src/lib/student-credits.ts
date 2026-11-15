import type { SupabaseClient } from '@supabase/supabase-js'

// The purchase row and account update commit in the same webhook transaction.
// Read the receipt first so a confirmed result always includes the paid balance.
export async function loadStudentCredits(
  client: SupabaseClient,
  userId: string,
  sessionId: string | null,
  signal: AbortSignal,
) {
  let confirmed = false
  if (sessionId) {
    const { data, error } = await client.from('credit_purchases')
      .select('stripe_session_id').eq('user_id', userId)
      .eq('stripe_session_id', sessionId).abortSignal(signal).maybeSingle()
    if (error) throw error
    confirmed = Boolean(data)
  }

  const { data, error } = await client.from('credit_accounts')
    .select('credits, unlimited, active').eq('user_id', userId)
    .abortSignal(signal).maybeSingle()
  if (error) throw error

  return {
    credits: data?.active ? Math.max(0, data.credits ?? 0) : 0,
    unlimited: Boolean(data?.active && data.unlimited),
    confirmed,
  }
}
