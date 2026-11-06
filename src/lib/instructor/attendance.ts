import { timestampMilliseconds } from './adapters'
import type { InstructorApi } from './calendar-queries'
import { collectCalendarPages } from './calendar-queries'
import { InstructorDataError } from './errors'
import { rosterAttendance } from './calendar-view'
import type { AttendanceSnapshot, EventId, EventRow, EventStudentRow, RosterEntry } from './types'

export function attendanceSnapshot(record: EventStudentRow): AttendanceSnapshot {
  return { studentId: record.student_id, status: record.attendance_status, recordedAt: record.recorded_at, checkedInAt: record.checked_in_at }
}

export function attendanceEditable(event: EventRow, now = new Date()) {
  return event.status === 'scheduled' && event.starts_at !== null && event.ends_at !== null
    && timestampMilliseconds(event.ends_at) > now.getTime()
}

export function editableAttendanceRows(entries: RosterEntry[], startsAt: string | null) {
  return entries.filter(entry => !['late', 'excused'].includes(rosterAttendance(entry.record, startsAt)))
}

export async function loadAttendanceRoster(api: InstructorApi, eventId: EventId, signal: AbortSignal) {
  const session = await api.getEvent(eventId, signal)
  if (!session) throw new InstructorDataError('forbidden', 'This session is no longer assigned to your account.')
  const entries = await collectCalendarPages(options => api.getRoster(eventId, options), item => item.record.student_id, signal)
  return { session, entries }
}
