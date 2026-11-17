import type { SupabaseClient } from '@supabase/supabase-js'

export type CreditBatch = {
  id: string
  title: string
  total: number
  remaining: number
  unlimited: boolean
  expiresAt: string | null // null means the database's explicit infinity value
  createdAt: string
  legacy: boolean
}

export function creditBatchStatus(batch: CreditBatch, now = Date.now()) {
  if (!batch.unlimited && batch.remaining === 0) return 'used' as const
  if (batch.expiresAt === null) return 'active' as const
  const timeLeft = Date.parse(batch.expiresAt) - now
  if (timeLeft <= 0) return 'expired' as const
  return timeLeft <= 21 * 86_400_000 ? 'expiring' as const : 'active' as const
}

export async function loadStudentCreditBatches(client: SupabaseClient, userId: string, signal: AbortSignal): Promise<CreditBatch[]> {
  const batches: CreditBatch[] = []
  const pageSize = 200
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('credit_batches')
      .select('id, credits_total, credits_remaining, unlimited, expires_at, created_at, source, credit_purchases(pass_title)')
      // Unlimited passes hold 0 credits by design, so they're loaded by their flag, not their count.
      .eq('user_id', userId).or('credits_remaining.gt.0,unlimited.eq.true')
      .order('expires_at').order('created_at').order('id')
      .range(offset, offset + pageSize - 1).abortSignal(signal)
    if (error) throw error
    for (const row of data ?? []) {
      const purchase = Array.isArray(row.credit_purchases) ? row.credit_purchases[0] : row.credit_purchases
      if (typeof row.id !== 'string' || !Number.isInteger(row.credits_total) || row.credits_total < 0 ||
        !Number.isInteger(row.credits_remaining) || row.credits_remaining < 0 || row.credits_remaining > row.credits_total ||
        typeof row.unlimited !== 'boolean' ||
        (row.expires_at !== null && (typeof row.expires_at !== 'string' ||
          (row.expires_at !== 'infinity' && !Number.isFinite(Date.parse(row.expires_at))))) ||
        typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) {
        throw new Error('Invalid credit batch record.')
      }
      batches.push({
        id: row.id,
        title: row.source === 'legacy' ? (row.unlimited ? 'Legacy unlimited pass' : 'Legacy credits')
          : purchase?.pass_title || 'Class pass',
        total: row.credits_total, remaining: row.credits_remaining, unlimited: row.unlimited,
        expiresAt: row.expires_at === 'infinity' || row.expires_at === null ? null : row.expires_at,
        createdAt: row.created_at, legacy: row.source === 'legacy',
      })
    }
    if (!data || data.length < pageSize) break
  }
  return batches.filter(batch => batch.unlimited || batch.remaining > 0)
}
