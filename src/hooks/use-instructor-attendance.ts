import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useInstructorRoster } from './use-instructor-class-queries'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { parseEntityId } from '@/lib/instructor/adapters'
import { attendanceCoordinator, emptyAttendanceWrite } from '@/lib/instructor/attendance-coordinator'
import { instructorQueryKeys as keys, instructorQueryTimes as times } from '@/lib/instructor/query-keys'
import type { AttendanceMark, EventId, StudentId } from '@/lib/instructor/types'

export function useInstructorAttendance(eventId: EventId, enabled: boolean) {
  const api = useInstructorApi()
  const client = useQueryClient()
  const { session, profile } = useAuth()
  const userId = profile?.role === 'instructor' && profile.id === session?.user.id ? session.user.id : undefined
  const { data: state } = useQuery({ queryKey: keys.attendanceWrite(userId ?? '', eventId),
    queryFn: () => emptyAttendanceWrite, enabled: false, initialData: emptyAttendanceWrite, ...times.roster })
  const roster = useInstructorRoster(eventId, enabled)
  const permissionLost = roster.failureCode === 'forbidden' || roster.failureCode === 'unauthenticated'
  const base = state.hide || permissionLost ? null : roster.data ?? ((state.pending || state.error) ? state.base : null) ?? null
  const backgroundError = !state.pending && roster.status === 'success' ? roster.refreshError : null
  const data = base ? { ...base, entries: base.entries.map(entry => {
    const optimistic = state.rows[entry.record.student_id]?.optimistic
    return optimistic === undefined ? entry : { ...entry, record: { ...entry.record,
      attendance_status: optimistic === 'unmarked' ? null : optimistic } }
  }) } : null
  const coordinator = () => userId ? attendanceCoordinator(client, api, parseEntityId(userId, 'auth-user'), eventId) : null
  return {
    query: state.pending || state.error ? { ...roster, status: 'success' as const }
      : permissionLost ? { ...roster, status: 'error' as const, data: null, error: roster.refreshError } : roster,
    data, pending: state.pending, refreshing: state.refreshing || (roster.isFetching && data !== null),
    bulkPending: state.bulk, rows: state.rows, error: state.error ?? backgroundError,
    message: state.message ?? (backgroundError ? 'Last confirmed values are shown. Refresh failed; reload before marking again.' : null),
    retryLabel: state.retry === 'write' ? 'Retry save' : 'Reload attendance',
    mark: (status: AttendanceMark, studentId?: StudentId) => { if (enabled && !backgroundError && !permissionLost) coordinator()?.mark(status, studentId) },
    retry: () => { if (state.error) void coordinator()?.retry(); else roster.retry() },
  }
}
