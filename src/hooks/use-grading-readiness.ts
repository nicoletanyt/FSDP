import { useCallback, useEffect, useState } from 'react'
import type { ChecklistRequirement } from '@/components/grading/EligibilityChecklist'
import { supabase } from '@/lib/supabase'

export type ReadinessRow = ChecklistRequirement & { target_grade_id: string; target_grade_label: string }

type Snapshot = { userId: string; rows: ReadinessRow[]; loading: boolean; error: boolean }

/**
 * The signed-in student's eligibility for their next grade, from
 * public.my_grading_readiness(). It runs the same student_grading_readiness()
 * rules as the instructor and admin eligibility views, so every portal agrees.
 * No rows means there is no next grade on the student's ladder.
 */
export function useGradingReadiness(userId: string | undefined) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    setSnapshot({ userId, rows: [], loading: true, error: false })
    void Promise.resolve(supabase.rpc('my_grading_readiness').abortSignal(controller.signal)).then(({ data, error }) => {
      if (controller.signal.aborted) return
      setSnapshot({ userId, rows: error ? [] : ((data ?? []) as ReadinessRow[]), loading: false, error: Boolean(error) })
    }).catch(() => {
      if (!controller.signal.aborted) setSnapshot({ userId, rows: [], loading: false, error: true })
    })
    return () => controller.abort()
  }, [userId, revision])

  const current = snapshot?.userId === userId ? snapshot : null
  return {
    rows: current?.rows ?? [],
    loading: Boolean(userId) && (current?.loading ?? true),
    error: current?.error ?? false,
    retry,
  }
}
