import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'

// Loaders shared by the Attendance watch / Eligibility pages and their tab
// badges, so both read one cached result per key.

export const attendanceMonitoringKey = (userId: string | undefined, centreId: string | null) =>
  ['admin', 'attendance-monitoring-recent-enrolments', userId, centreId] as const

export async function loadAttendanceMonitoring<T>(centreId: string | null): Promise<T[]> {
  const { data, error } = await supabase.rpc('admin_attendance_monitoring', { target_centre: centreId })
  if (error) throw error
  if (!Array.isArray(data)) throw new Error('No monitoring data was returned.')
  return data as T[]
}

export const gradingEligibilityKey = (userId: string | undefined, eventId: string) =>
  ['admin', 'grading-eligibility', userId, eventId] as const

export async function loadGradingEligibility<T>(eventId: string): Promise<T[]> {
  const { data, error } = await supabase.rpc('admin_grading_eligibility', { target_event: eventId || null })
  if (error) throw error
  if (!Array.isArray(data)) throw new Error('No eligibility results were returned.')
  return data as T[]
}

/** At-risk students across every dojo, for the Attendance watch tab badge. */
export function useAtRiskCount() {
  const { session } = useAuth()
  return useQuery({
    queryKey: attendanceMonitoringKey(session?.user.id, null),
    queryFn: () => loadAttendanceMonitoring<{ level: string }>(null),
    enabled: Boolean(session),
    select: (students) => students.filter(student => student.level === 'at_risk').length,
  }).data
}

/** Students eligible for an open grading, for the Eligibility tab badge. */
export function useEligibleCount() {
  const { session } = useAuth()
  return useQuery({
    queryKey: gradingEligibilityKey(session?.user.id, ''),
    queryFn: () => loadGradingEligibility(''),
    enabled: Boolean(session),
    select: (students) => students.length,
  }).data
}
