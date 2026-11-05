import { addDays, classTypes, getEventStyle, monthDates, parseCalendarDate, weekDates } from '../instructor-calendar'
import type { ClassType, EventType } from '../instructor-calendar'
import { attendanceFromArrival, toAttendanceState, toSingaporeDateTime, timestampMilliseconds } from './adapters'
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
  startsAt: string
  endsAt: string
  status: CalendarEntry['event']['status']
}

export type CalendarEventsForDate = (date: Date) => CalendarViewEvent[]

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
  const start = toSingaporeDateTime(entry.event.starts_at)
  const end = toSingaporeDateTime(entry.event.ends_at)
  const classType = entry.classType && Object.hasOwn(classTypes, entry.classType.id)
    ? entry.classType.id as ClassType : undefined
  return {
    id: entry.event.id, date: parseCalendarDate(start.date)!, name: entry.event.name,
    type: entry.event.event_type === 'class' ? 'training' : entry.event.event_type,
    classType, startTime: start.time, endTime: start.date === end.date ? end.time : '24:00',
    dojo: entry.centre?.name ?? 'Centre not recorded', instructorId: entry.event.instructor_id,
    rosterCount: entry.rosterCount, capacity: entry.centre?.capacity ?? null,
    startsAt: entry.event.starts_at, endsAt: entry.event.ends_at, status: entry.event.status,
  }
}

export function calendarEventsForDate(events: CalendarViewEvent[], day: Date): CalendarViewEvent[] {
  const start = timestampMilliseconds(`${calendarDateValue(day)}T00:00:00+08:00`)
  const end = timestampMilliseconds(`${calendarDateValue(addDays(day, 1))}T00:00:00+08:00`)
  return events.filter(event => timestampMilliseconds(event.startsAt) < end && timestampMilliseconds(event.endsAt) > start)
    .map(event => ({ ...event, date: day,
      startTime: timestampMilliseconds(event.startsAt) < start ? '00:00' : toSingaporeDateTime(event.startsAt).time,
      endTime: timestampMilliseconds(event.endsAt) >= end ? '24:00' : toSingaporeDateTime(event.endsAt).time,
    })).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
}

export function toCalendarAvailability(slot: InstructorAvailabilityRow): AvailabilitySlot {
  const date = parseCalendarDate(slot.date)
  if (!date) throw new InstructorDataError('invalid_data', 'The availability date is invalid.')
  return { id: slot.id, date, startTime: slot.start_time.slice(0, 5), endTime: slot.end_time.slice(0, 5) }
}

export function calendarRange(date: Date, view: 'day' | 'week' | 'month', desktop: boolean, mobileList: boolean) {
  const days = !desktop && mobileList ? Array.from({ length: 14 }, (_, index) => addDays(date, index))
    : view === 'month' ? monthDates(date)
    : view === 'week' ? desktop ? weekDates(date) : [date, addDays(date, 1)] : [date]
  return { from: calendarDateValue(days[0]), to: calendarDateValue(addDays(days.at(-1)!, 1)) }
}

export function rosterSizeLabel(event: CalendarViewEvent) {
  return `${event.rosterCount}${event.capacity === null ? '' : `/${event.capacity}`} students`
}

export function rosterAttendance(record: EventStudentRow, startsAt: string) {
  // Absence/excusal and unmarked records are explicit states. Re-editing an
  // attendance row must not replace its first actual check-in time.
  if (record.attendance_status !== 'present' && record.attendance_status !== 'late') return toAttendanceState(record.attendance_status)
  return attendanceFromArrival(startsAt, record.checked_in_at ?? record.recorded_at) ?? record.attendance_status
}
