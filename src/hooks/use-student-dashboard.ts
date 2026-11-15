import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { fetchDashboardSummary, type DashboardSummary } from '@/lib/student-dashboard'

/** Loads the signed-in student's dashboard summary (belt, progress, classes, grading). */
export function useStudentDashboard() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [result, setResult] = useState<{
    userId: string
    summary: DashboardSummary | null
    error: boolean
  } | null>(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetchDashboardSummary()
      .then((summary) => !cancelled && setResult({ userId, summary, error: false }))
      .catch(() => !cancelled && setResult({ userId, summary: null, error: true }))
    return () => {
      cancelled = true
    }
  }, [userId])

  // Ignore a result left over from a previously signed-in user.
  const current = result?.userId === userId ? result : null

  return {
    summary: current?.summary ?? null,
    loading: !!userId && !current,
    error: current?.error ?? false,
  }
}
