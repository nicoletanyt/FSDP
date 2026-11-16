import { useCallback } from 'react'
import { useStudentQuery, useStudentUserId } from '@/hooks/use-student-query'
import { fetchDashboardSummary } from '@/lib/student-dashboard'
import { studentQueryKeys as keys, studentQueryTimes as times } from '@/lib/student/query-keys'

/** Loads the signed-in student's dashboard summary (belt, progress, classes, grading). */
export function useStudentDashboard() {
  const userId = useStudentUserId()
  const query = useStudentQuery(keys.dashboard, (_userId, signal) => fetchDashboardSummary(signal), times.account)
  const loading = !!userId && query.data === undefined && (query.isPending || query.isFetching)
  const { refetch } = query
  const reload = useCallback(() => { void refetch() }, [refetch])
  return {
    summary: query.data ?? null,
    loading,
    error: query.data === undefined && !loading && query.isError,
    reload,
  }
}
