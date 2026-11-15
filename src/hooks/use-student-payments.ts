import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { loadStudentPayments } from '@/lib/student-payments'
import type { Payment } from '@/lib/student-profile'

type Snapshot = { userId: string; payments: Payment[]; loading: boolean; error: string }

export function useStudentPayments(userId: string | undefined) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') retry() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [retry])

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    setSnapshot({ userId, payments: [], loading: true, error: '' })
    void loadStudentPayments(supabase, userId, controller.signal).then((payments) => {
      if (!controller.signal.aborted) setSnapshot({ userId, payments, loading: false, error: '' })
    }).catch(() => {
      if (!controller.signal.aborted) setSnapshot({
        userId, payments: [], loading: false, error: 'Unable to load your payments. Please try again.',
      })
    })
    return () => controller.abort()
  }, [userId, revision])

  const current = snapshot?.userId === userId ? snapshot : null
  return { payments: current?.payments ?? [], loading: Boolean(userId) && (current?.loading ?? true), error: current?.error ?? '', retry }
}
