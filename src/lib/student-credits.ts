import type { SupabaseClient } from '@supabase/supabase-js'

export type ExpiringCredits = { credits: number; expiresAt: string }

export function creditLoadErrorMessage(failure: unknown): string {
  const code = (failure as { code?: string } | null)?.code
  if (code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883') {
    return 'Credit batches are not configured. Apply the add_credit_batches database migration, then refresh your balance.'
  }
  if (code === '42501') {
    return 'Credit access was denied. Check the database migration permissions and sign in again.'
  }
  if (code === 'PGRST301' || code === 'PGRST302' ||
    (failure as { message?: string } | null)?.message === 'Student authentication required.') {
    return 'Please sign in again with your student account to load your credits.'
  }
  return 'Unable to load your credits. Please try again.'
}

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

  // The owner-scoped RPC excludes expired batches and reconciles the cached
  // total atomically. Neither the success URL nor a local balance grants credits.
  const { data, error } = await client.rpc('my_credit_summary').abortSignal(signal)
  if (error) throw error
  if (!data || !Number.isInteger(data.credits) || data.credits < 0 ||
    typeof data.active !== 'boolean' || typeof data.unlimited !== 'boolean') {
    throw new Error('Invalid credit summary.')
  }
  const expiring: ExpiringCredits | null = data.active && data.expiring &&
    Number.isInteger(data.expiring.credits) && data.expiring.credits > 0 &&
    typeof data.expiring.expiresAt === 'string' && Number.isFinite(Date.parse(data.expiring.expiresAt))
    ? { credits: data.expiring.credits, expiresAt: data.expiring.expiresAt }
    : null

  return {
    credits: data?.active ? Math.max(0, data.credits ?? 0) : 0,
    unlimited: Boolean(data?.active && data.unlimited),
    expiring,
    confirmed,
  }
}
