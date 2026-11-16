import type { QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { dataSaverEnabled } from '@/lib/instructor/prefetch'
import { studentQueryKeys as keys, studentQueryTimes as times } from './query-keys'

export type StudentScheduleSnapshot = {
  grade: string | null
  linked: boolean
  active: boolean
  sessions: StudentScheduleSession[]
}

export type StudentScheduleSession = {
  id: string
  name: string
  starts_at: string
  ends_at: string
  status: string
  class_type_id: string
  class_type: string
  description: string | null
  centre: string
  instructor: string | null
  capacity: number | null
  occupied: number
  booked: boolean
  waitlisted: boolean
  attendance_status: 'present' | 'absent' | 'late' | 'excused' | null
  moved_from_event_id: string | null
}

export async function loadStudentSchedule(signal: AbortSignal) {
  const { data, error } = await supabase.rpc('student_class_schedule').abortSignal(signal)
  if (error) throw error
  return data as StudentScheduleSnapshot
}

export function scheduleQueryOptions(userId: string) {
  return {
    queryKey: keys.schedule(userId),
    queryFn: ({ signal }: { signal: AbortSignal }) => loadStudentSchedule(signal),
    ...times.schedule,
  }
}

/** Warms the schedule before the timetable/classes route mounts (as useInstructorPrefetch does for weeks). */
export function prefetchStudentSchedule(client: QueryClient, userId: string | undefined) {
  if (!userId || dataSaverEnabled()) return
  void client.prefetchQuery({ ...scheduleQueryOptions(userId), retry: false })
}
