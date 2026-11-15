import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { loadStudentCreditBatches } from '@/lib/student-credit-batches'
import type { CreditBatch } from '@/lib/student-credit-batches'

type Snapshot = { userId: string; batches: CreditBatch[]; loading: boolean; error: string }

export function useStudentCreditBatches(userId: string | undefined) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision(value => value + 1), [])

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
    const ownerId = userId
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    setSnapshot({ userId, batches: [], loading: true, error: '' })
    async function refresh() {
      try {
        const batches = await loadStudentCreditBatches(supabase, ownerId, controller.signal)
        if (!controller.signal.aborted) {
          setSnapshot({ userId: ownerId, batches, loading: false, error: '' })
          timer = setTimeout(() => void refresh(), 60_000)
        }
      } catch {
        if (!controller.signal.aborted) setSnapshot({
          userId: ownerId, batches: [], loading: false, error: 'Unable to load your passes. Please try again.',
        })
      }
    }
    void refresh()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [userId, revision])

  const current = snapshot?.userId === userId ? snapshot : null
  return { batches: current?.batches ?? [], loading: Boolean(userId) && (current?.loading ?? true), error: current?.error ?? '', retry }
}
