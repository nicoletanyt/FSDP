import type { SupabaseClient } from '@supabase/supabase-js'
import type { Payment } from './student-profile'

const PAGE_SIZE = 500
const LEGACY_GRADING_FEE = 60 // SGD; attempts paid before per-grade fees were all $60

export async function loadStudentPayments(client: SupabaseClient, userId: string, signal: AbortSignal): Promise<Payment[]> {
  const payments: Payment[] = []
  const sessions = new Set<string>()

  // Explicit ownership filters supplement RLS, including for administrator accounts.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.from('payments')
      .select('id, item, description, amount_cents, method, status, stripe_session_id, created_at, paid_at, students!inner(user_id)')
      .eq('students.user_id', userId).eq('currency', 'sgd')
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1).abortSignal(signal)
    if (error) throw error
    for (const row of data ?? []) {
      if (row.stripe_session_id) sessions.add(row.stripe_session_id)
      payments.push({
        id: row.id, date: row.paid_at ?? row.created_at, item: row.item,
        description: row.description, method: row.method, amount: row.amount_cents / 100,
        status: row.status === 'paid' ? 'Paid' : row.status === 'refunded' ? 'Refunded' : 'Pending',
      })
    }
    if (!data || data.length < PAGE_SIZE) break
  }

  // A credit purchase exists even when the account has no linked student row.
  // Prefer the payment row (including refund status) when both records exist.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.from('credit_purchases')
      .select('stripe_session_id, pass_title, amount_cents, created_at')
      .eq('user_id', userId).eq('currency', 'sgd')
      .order('created_at', { ascending: false }).order('stripe_session_id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1).abortSignal(signal)
    if (error) throw error
    for (const row of data ?? []) {
      if (sessions.has(row.stripe_session_id)) continue
      payments.push({
        id: `credit:${row.stripe_session_id}`, date: row.created_at, item: 'Class pass',
        description: row.pass_title, method: 'Stripe', amount: row.amount_cents / 100, status: 'Paid',
      })
    }
    if (!data || data.length < PAGE_SIZE) break
  }

  // Paid grading checkouts are recorded on the attempt rather than in `payments`.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.from('grading_checkout_attempts')
      .select('id, created_at, amount_cents, grade:grades!grading_checkout_attempts_target_grade_id_fkey(label), students!inner(user_id)')
      .eq('students.user_id', userId).eq('status', 'paid')
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1).abortSignal(signal)
    if (error) throw error
    for (const row of data ?? []) {
      const grade = Array.isArray(row.grade) ? row.grade[0] : row.grade
      payments.push({
        id: `grading:${row.id}`, date: row.created_at, item: 'Grading',
        description: `Grading fee${grade?.label ? ` — ${grade.label}` : ''}`,
        method: 'Stripe', amount: row.amount_cents ? row.amount_cents / 100 : LEGACY_GRADING_FEE, status: 'Paid',
      })
    }
    if (!data || data.length < PAGE_SIZE) break
  }

  return payments.sort((a, b) => b.date.localeCompare(a.date))
}
