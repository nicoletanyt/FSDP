import { timestampMilliseconds } from './adapters'
import type { InstructorApi } from './calendar-queries'
import { rosterAttendance } from './calendar-view'
import type { AttendanceSnapshot, EventId, EventRow, EventStudentRow, RosterEntry } from './types'

export function attendanceSnapshot(record: EventStudentRow): AttendanceSnapshot {
  return { studentId: record.student_id, status: record.attendance_status, recordedAt: record.recorded_at, checkedInAt: record.checked_in_at }
}

export function attendanceEditable(event: EventRow, now = new Date()) {
  return event.status === 'scheduled' && event.starts_at !== null && event.ends_at !== null
    && timestampMilliseconds(event.ends_at) > now.getTime()
}

export function lessonNotEnded(endsAt: string | null, now = new Date()) {
  return endsAt === null || timestampMilliseconds(endsAt) > now.getTime()
}

export function editableAttendanceRows(entries: RosterEntry[], startsAt: string | null) {
  return entries.filter(entry => !['late', 'excused'].includes(rosterAttendance(entry.record, startsAt)))
}

export async function loadAttendanceRoster(api: InstructorApi, eventId: EventId, signal: AbortSignal) {
  return api.getAttendanceRoster(eventId, signal)
}
