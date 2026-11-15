import { supabase } from '@/lib/supabase'

/** State passed from the grading application form. All fields are optional so the page can fall back to demo data. */
export type GradingPaymentLocationState = {
  studentName?: string
  currentBelt?: string
  targetBelt?: string
  fee?: number | string
  studentId?: string
  gradingEventId?: string
  targetGradeId?: string
  gradingTrack?: 'adult' | 'children'
  applicationDeadline?: string
  gradingDate?: string
  expectedTotalCents?: number
}

export type GradingPaymentRecord = {
  applicationId: string
  gradingEventId: string
  targetGradeId: string
  submittedAt: string
}

type RecordGradingPaymentRpcRow = {
  application_id: string
  grading_event_id: string
  target_grade_id: string
  submitted_at: string
}

/**
 * Persist a confirmed grading payment against the real `grading_applications`
 * table through the `record_grading_payment` RPC.
 *
 * The live table stores the application as `submitted` (the enum has no `paid`
 * value) and uses `target_grade_id` instead of a free-text belt name. The
 * payment amount and paid date stay in the UI receipt; production should keep
 * them in a payments/checkout record and finalise applications from the Stripe
 * webhook instead of the browser.
 *
 * When the application form did not pass IDs, the RPC resolves the signed-in
 * student's next eligible grading opportunity.
 */
export async function recordGradingPayment({
  gradingEventId,
  targetGradeId,
}: {
  gradingEventId?: string
  targetGradeId?: string
}): Promise<GradingPaymentRecord> {
  const { data, error } = await supabase.rpc('record_grading_payment', {
    p_grading_event_id: gradingEventId ?? null,
    p_target_grade_id: targetGradeId ?? null,
  })

  if (error) throw new Error(error.message)

  const row = (Array.isArray(data) ? data[0] : data) as RecordGradingPaymentRpcRow | null
  if (!row?.application_id) throw new Error('Supabase did not return the saved grading application.')

  return {
    applicationId: row.application_id,
    gradingEventId: row.grading_event_id,
    targetGradeId: row.target_grade_id,
    submittedAt: row.submitted_at,
  }
}

export function formatCardNumber(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 16)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

export function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)} / ${digits.slice(2)}`
}

export function formatCvc(value: string) {
  return value.replace(/\D/g, '').slice(0, 4)
}

export function isValidExpiry(value: string, now = new Date()) {
  const match = /^(0[1-9]|1[0-2])\s*\/\s*(\d{2})$/.exec(value)
  if (!match) return false
  const month = Number(match[1])
  const year = 2000 + Number(match[2])
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)
}

export function gradingReference(date = new Date()) {
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  return `GRD-${stamp}-${String(date.getTime()).slice(-6)}`
}
