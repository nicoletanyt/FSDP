import { useCallback } from 'react'
import { useStudentQuery, useStudentUserId } from '@/hooks/use-student-query'
import { supabase } from '@/lib/supabase'
import { studentQueryKeys as keys, studentQueryTimes as times } from '@/lib/student/query-keys'

/** "none" means the account has no students row yet (never applied or paid). */
export type MembershipStatus = 'active' | 'pending' | 'expired' | 'none'

const knownStatuses: MembershipStatus[] = ['active', 'pending', 'expired']

/**
 * Reads the signed-in student's public.students.membership_status.
 * RLS lets a student read only their own row, and only administrators
 * (or the Stripe webhook) can change it, so the browser cannot fake membership.
 */
export function useMembershipStatus() {
  const userId = useStudentUserId()
  const query = useStudentQuery(keys.membership, async (userId, signal) => {
    const { data, error } = await supabase
      .from('students')
      .select('membership_status')
      .eq('user_id', userId)
      .abortSignal(signal)
      .maybeSingle()
    if (error) throw error
    return knownStatuses.find((s) => s === data?.membership_status) ?? 'none'
  }, times.account)

  const { refetch } = query
  /** Re-check without clearing the current result (no loading flash). */
  const reload = useCallback(() => { void refetch() }, [refetch])
  const loading = !!userId && query.data === undefined && (query.isPending || query.isFetching)
  return {
    status: query.data ?? null,
    loading,
    error: query.data === undefined && !loading && query.isError,
    reload,
  }
}
