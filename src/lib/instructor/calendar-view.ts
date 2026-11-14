import { addDays, classTypes, formatTime, getEventStyle, monthDates, parseCalendarDate, weekDates } from '../instructor-calendar'
import type { ClassType, EventType } from '../instructor-calendar'
import { attendanceFromArrival, gradingEventDate, publishedReportingTime, toAttendanceState, toSingaporeDateTime, timestampMilliseconds } from './adapters'
import { InstructorDataError } from './errors'
import type { AvailabilitySlot } from '../instructor-availability'
import type { CalendarEntry, EventStudentRow, InstructorAvailabilityRow } from './types'

export interface CalendarViewEvent {
  id: string
  date: Date
  name: string
  type: EventType
  classType?: ClassType
  startTime: string
  endTime: string
  dojo: string
  instructorId: string | null
  rosterCount: number
  capacity: number | null
  startsAt: string | null
  endsAt: string | null
  dateOnly: boolean
  reportingTime: string | null
  reportingReleaseOn: string | null
  status: CalendarEntry['event']['status']
  // Set on a grading session block: the panel shows only that session's candidates.
  gradeSession?: { eventId: string; sessionId: string }
}

export type CalendarEventsForDate = (date: Date) => CalendarViewEvent[]

// A grading session block's id is `${eventId}:${sessionId}`; every event read
// (roster, attendance, student context) uses the event part.
export function calendarEventId(id: string) {
  return id.split(':')[0]
}

export function calendarClassStyle(id: string) {
  return getEventStyle({ type: 'training', classType: Object.hasOwn(classTypes, id) ? id as ClassType : undefined })
}

export function calendarDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// These Dates are wall-clock display coordinates, not database instants. All
// transport comparisons use startsAt/endsAt with their original explicit offset.
export function singaporeClock(instant = new Date()): Date {
  const { date, time } = toSingaporeDateTime(instant.toISOString())
  const result = parseCalendarDate(date)!
  const [hour, minute] = time.split(':').map(Number)
  result.setHours(hour, minute, instant.getUTCSeconds(), instant.getUTCMilliseconds())
  return result
}

export function toCalendarViewEvent(entry: CalendarEntry): CalendarViewEvent {
  const dateOnly = entry.event.starts_at === null
  const date = gradingEventDate(entry.event, entry.grading)
  if (dateOnly && (entry.event.event_type !== 'grading' || !date)) {
    throw new InstructorDataError('invalid_data', 'The grading date has not been recorded.')
  }
  const start = entry.event.starts_at ? toSingaporeDateTime(entry.event.starts_at) : { date: date!, time: '' }
  const end = entry.event.ends_at ? toSingaporeDateTime(entry.event.ends_at) : null
  const reportingTime = publishedReportingTime(entry.grading, toSingaporeDateTime(new Date().toISOString()).date)
  const classType = entry.classType && Object.hasOwn(classTypes, entry.classType.id)
    ? entry.classType.id as ClassType : undefined
  return {
    id: entry.event.id, date: parseCalendarDate(start.date)!, name: entry.event.name,
    type: entry.event.event_type === 'class' ? 'training' : entry.event.event_type,
    classType, startTime: dateOnly ? reportingTime ? `Report at ${formatTime(reportingTime)}` : 'Time not published' : start.time,
    endTime: end ? start.date === end.date ? end.time : '24:00' : '',
    dojo: entry.centre?.name ?? 'Centre not recorded', instructorId: entry.event.instructor_id,
    rosterCount: entry.rosterCount, capacity: entry.centre?.capacity ?? null,
    startsAt: entry.event.starts_at, endsAt: entry.event.ends_at, status: entry.event.status,
    dateOnly, reportingTime, reportingReleaseOn: entry.grading?.reporting_release_on ?? null,
  }
}

// Gradings the caller examines become one block per sorted session, each at
// its own time. Everything else (and unsorted gradings, or ones the caller
// doesn't examine) stays a single block.
export function toCalendarViewEvents(entry: CalendarEntry): CalendarViewEvent[] {
  const event = toCalendarViewEvent(entry)
  const timed = entry.onPanel && entry.event.event_type === 'grading'
    ? entry.gradeSessions.filter(session => session.startsAt && session.endsAt && session.candidates > 0) : []
  if (!timed.length) return [event]
  const track = entry.grading?.track === 'adult' ? 'Adult grading' : entry.grading?.track === 'children' ? "Children's grading" : entry.event.name
  return timed.map(session => {
    const start = toSingaporeDateTime(session.startsAt!)
    const end = toSingaporeDateTime(session.endsAt!)
    return {
      ...event, id: `${entry.event.id}:${session.id}`, name: `Session ${session.position} · ${track}`,
      date: parseCalendarDate(start.date)!, startTime: start.time, endTime: start.date === end.date ? end.time : '24:00',
      startsAt: session.startsAt, endsAt: session.endsAt, dateOnly: false, rosterCount: session.candidates,
      gradeSession: { eventId: entry.event.id, sessionId: session.id },
    }
  })
}

export function calendarEventsForDate(events: CalendarViewEvent[], day: Date): CalendarViewEvent[] {
  const start = timestampMilliseconds(`${calendarDateValue(day)}T00:00:00+08:00`)
  const end = timestampMilliseconds(`${calendarDateValue(addDays(day, 1))}T00:00:00+08:00`)
  return events.filter(event => event.dateOnly ? calendarDateValue(event.date) === calendarDateValue(day)
    : timestampMilliseconds(event.startsAt) < end && timestampMilliseconds(event.endsAt) > start)
    .map(event => event.dateOnly ? event : ({ ...event, date: day,
      startTime: timestampMilliseconds(event.startsAt) < start ? '00:00' : toSingaporeDateTime(event.startsAt!).time,
      endTime: timestampMilliseconds(event.endsAt) >= end ? '24:00' : toSingaporeDateTime(event.endsAt!).time,
    })).sort((a, b) => Number(b.dateOnly) - Number(a.dateOnly) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
}

export function calendarTimeLabel(event: CalendarViewEvent, separator = ' – ') {
  return event.dateOnly ? event.startTime : `${formatTime(event.startTime)}${separator}${formatTime(event.endTime)}`
}

export function toCalendarAvailability(slot: InstructorAvailabilityRow): AvailabilitySlot {
  const date = parseCalendarDate(slot.date)
  if (!date) throw new InstructorDataError('invalid_data', 'The availability date is invalid.')
  return { id: slot.id, date, startTime: slot.start_time.slice(0, 5), endTime: slot.end_time.slice(0, 5),
    snapshot: { date: slot.date, startTime: slot.start_time, endTime: slot.end_time } }
}

// `weekDays`: the whole weeks covering a shorter (2–4 day) week view, when one is shown.
export function calendarRange(date: Date, view: 'day' | 'week' | 'month', desktop: boolean, mobileList: boolean, weekDays?: Date[]) {
  const days = !desktop && mobileList ? Array.from({ length: 14 }, (_, index) => addDays(date, index))
    : view === 'month' ? monthDates(date)
    : view === 'week' ? desktop ? weekDays ?? weekDates(date) : [date, addDays(date, 1)] : [date]
  return { from: calendarDateValue(days[0]), to: calendarDateValue(addDays(days.at(-1)!, 1)) }
}

export function rosterSizeLabel(event: CalendarViewEvent) {
  return `${event.rosterCount}${event.capacity === null ? '' : `/${event.capacity}`} students`
}

export function rosterAttendance(record: EventStudentRow, startsAt: string | null) {
  // Absence/excusal and unmarked records are explicit states. Re-editing an
  // attendance row must not replace its first actual check-in time.
  if (record.attendance_status !== 'present' && record.attendance_status !== 'late') return toAttendanceState(record.attendance_status)
  return startsAt ? attendanceFromArrival(startsAt, record.checked_in_at ?? record.recorded_at) ?? record.attendance_status : record.attendance_status
}
