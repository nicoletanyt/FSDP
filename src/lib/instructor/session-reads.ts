import { gradingEventDate, parseEntityId } from './adapters'
import { InstructorDataError } from './errors'
import { historyDate } from './student-detail'
import type { AssessmentKey, CalendarEntry, StudentId } from './types'

export function assessmentKey(params: { assessmentId?: string; eventId?: string; studentId?: string }): AssessmentKey {
  const parts = params.assessmentId === undefined ? [params.eventId, params.studentId] : params.assessmentId.split('--')
  if (parts.length !== 2) throw new InstructorDataError('invalid_data', 'An assessment needs an event UUID and a student UUID.')
  return { eventId: parseEntityId(parts[0], 'event'), studentId: parseEntityId(parts[1], 'student') }
}

export function sessionDateLabel(session: CalendarEntry) {
  const date = gradingEventDate(session.event, session.grading)
  return date ? historyDate(`${date}T00:00:00+08:00`) : 'Date not recorded'
}

export function sessionCalendarHref(session: CalendarEntry) {
  const params = new URLSearchParams({ session: session.event.id })
  const date = gradingEventDate(session.event, session.grading)
  if (date) params.set('date', date)
  return `/instructor/calendar?${params}`
}

export function sessionStudentHref(session: CalendarEntry, studentId: StudentId, tab: 'sessions' | 'grading') {
  const params = new URLSearchParams({ session: session.event.id, tab })
  const date = gradingEventDate(session.event, session.grading)
  if (date) params.set('date', date)
  return `/instructor/students/${studentId}?${params}`
}
