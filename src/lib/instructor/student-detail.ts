import { toSingaporeDateTime } from './adapters'
import { collectCalendarPages } from './calendar-queries'
import type { InstructorApi } from './calendar-queries'
import type { EventId, InstructorRow, StudentAttendanceSummary } from './types'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric',
})

export function historyDate(timestamp: string) {
  return dateFormat.format(new Date(timestamp))
}

export function historyTimeRange(startsAt: string, endsAt: string) {
  const start = toSingaporeDateTime(startsAt)
  const end = toSingaporeDateTime(endsAt)
  return `${start.time} – ${end.time}${start.date === end.date ? '' : ` (${historyDate(endsAt)})`}`
}

export function instructorName(instructor: InstructorRow | null) {
  return instructor
    ? [instructor.first_name.trim(), instructor.last_name.trim()].filter(Boolean).join(' ') || instructor.email
    : 'Instructor not recorded'
}

export function attendanceTotals(summary: StudentAttendanceSummary) {
  const attended = summary.present + summary.late
  // Excused and unmarked classes are explicit facts, not absences. Display them
  // separately rather than including them in the attendance-rate denominator.
  const eligible = attended + summary.absent
  return { attended, eligible, rate: eligible ? Math.round(attended / eligible * 100) : null }
}

export async function loadStudentContext(api: InstructorApi, id: EventId, signal: AbortSignal) {
  const session = await api.getEvent(id, signal)
  if (!session) return null
  const roster = await collectCalendarPages(options => api.getRoster(id, options), entry => entry.student.student.id, signal)
  return { session, roster }
}
