import type { SupabaseClient } from '@supabase/supabase-js'

export type StudentMembershipStatus = 'active' | 'pending' | 'expired' | 'none'

/** The most recent paid membership fee: what the student paid to hold the membership. */
export type MembershipFee = {
  amount: number
  description: string
  paidAt: string
}

export type StudentMembership = {
  status: StudentMembershipStatus
  memberNo: string | null
  joinedAt: string | null
  /** Singapore date the membership lapses, or null while it is pending/unrecorded. */
  expiresOn: string | null
  fee: MembershipFee | null
}

const knownStatuses: StudentMembershipStatus[] = ['active', 'pending', 'expired']

/**
 * One read for the membership itself: the status stored on the students row, the
 * date it lapses, and the latest paid fee (which lives in `payments`, not in the
 * credit batches the pass list reads). RLS limits both tables to the student's own rows.
 */
export async function loadStudentMembership(
  client: SupabaseClient,
  userId: string,
  signal: AbortSignal,
): Promise<StudentMembership> {
  const { data: student, error } = await client
    .from('students')
    .select('id, member_no, membership_status, joined_at, membership_expires_on')
    .eq('user_id', userId)
    .abortSignal(signal)
    .maybeSingle()
  if (error) throw error
  if (!student) {
    return { status: 'none', memberNo: null, joinedAt: null, expiresOn: null, fee: null }
  }

  const { data: payment, error: paymentError } = await client
    .from('payments')
    .select('amount_cents, description, paid_at, created_at')
    .eq('student_id', student.id)
    .eq('item', 'Membership')
    .eq('status', 'paid')
    .order('paid_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .abortSignal(signal)
    .maybeSingle()
  if (paymentError) throw paymentError

  return {
    status: knownStatuses.find((status) => status === student.membership_status) ?? 'none',
    memberNo: student.member_no,
    joinedAt: student.joined_at,
    expiresOn: student.membership_expires_on,
    fee: payment
      ? {
          amount: payment.amount_cents / 100,
          description: payment.description,
          paidAt: payment.paid_at ?? payment.created_at,
        }
      : null,
  }
}
