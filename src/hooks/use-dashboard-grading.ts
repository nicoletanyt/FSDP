import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { loadDashboardGrading } from '@/lib/dashboard-grading'

type Snapshot = { userId: string; status: string; badge: number; loading: boolean }

export function useDashboardGrading(userId: string | undefined) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setRevision((value) => value + 1) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    setSnapshot({ userId, status: 'Loading applications…', badge: 0, loading: true })
    void loadDashboardGrading(supabase, userId, controller.signal).then((result) => {
      if (!controller.signal.aborted) setSnapshot({ userId, ...result, loading: false })
    }).catch(() => {
      if (!controller.signal.aborted) setSnapshot({ userId, status: 'Status unavailable — view applications', badge: 0, loading: false })
    })
    return () => controller.abort()
  }, [userId, revision])

  if (!userId) return { status: 'Sign in to view applications', badge: 0, loading: false }
  return snapshot?.userId === userId ? snapshot : { status: 'Loading applications…', badge: 0, loading: true }
}
