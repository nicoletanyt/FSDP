import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'

/** "none" means the account has no students row yet (never applied or paid). */
export type MembershipStatus = 'active' | 'pending' | 'expired' | 'none' | 'non_member'

const knownStatuses: MembershipStatus[] = ['active', 'pending', 'expired', 'non_member']

/**
 * Reads the signed-in student's public.students.membership_status.
 * RLS lets a student read only their own row, and only administrators
 * (or the Stripe webhook) can change it, so the browser cannot fake membership.
 */
export function useMembershipStatus() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{
    userId: string
    status: MembershipStatus | null
    error: boolean
  } | null>(null)

  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1)
    window.addEventListener('student-membership-changed', refresh)
    return () => window.removeEventListener('student-membership-changed', refresh)
  }, [])

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    supabase
      .from('students')
      .select('membership_status')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        const status = knownStatuses.find((s) => s === data?.membership_status) ?? 'none'
        setResult({ userId, status: error ? null : status, error: !!error })
      })

    return () => {
      cancelled = true
    }
  }, [userId, version])

  /** Re-check without clearing the current result (no loading flash). */
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  // Ignore a result left over from a previously signed-in user.
  const current = result?.userId === userId ? result : null

  return {
    status: current?.status ?? null,
    loading: !!userId && !current,
    error: current?.error ?? false,
    reload,
  }
}
