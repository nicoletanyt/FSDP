import { toIsoDate } from './format'
import type {
  AttendanceRecord,
  Centre,
  Instructor,
  Session,
  Student,
} from './types'

export interface AdminCalendarEvent {
  id: string
  session: Session
  date: Date
  startTime: string
  endTime: string
  name: string
  centreName: string
  instructorName: string
  roster: Student[]
}

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null
}

export function dateKey(date: Date): string {
  return toIsoDate(date)
}

export function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount)
}

export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7))
}

export function weekDates(date: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeek(date), index),
  )
}

export function weekLabel(date: Date): string {
  const start = startOfWeek(date)
  const end = addDays(start, 6)
  const startLabel = start.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(start.getFullYear() !== end.getFullYear()
      ? { year: 'numeric' }
      : {}),
  })
  const endLabel = end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${startLabel} – ${endLabel}`
}

export function fullDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

export function endTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return startTime
  const total = hours * 60 + minutes + durationMinutes
  const endHours = Math.floor(total / 60) % 24
  const endMinutes = total % 60
  return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`
}

export function rosterForSession(
  students: Student[],
  attendance: AttendanceRecord[],
  session: Session,
): Student[] {
  const base = students
    .filter((student) => student.homeCentreId === session.centreId)
    .sort((left, right) => left.firstName.localeCompare(right.firstName))
  const baseIds = new Set(base.map((student) => student.id))
  const recordedIds = new Set(
    attendance
      .filter((record) => record.sessionId === session.id)
      .map((record) => record.studentId),
  )
  const guests = students
    .filter(
      (student) => !baseIds.has(student.id) && recordedIds.has(student.id),
    )
    .sort((left, right) => left.firstName.localeCompare(right.firstName))
  return [...base, ...guests]
}

export function buildCalendarEvent({
  session,
  centres,
  instructors,
  students,
  attendance,
}: {
  session: Session
  centres: Centre[]
  instructors: Instructor[]
  students: Student[]
  attendance: AttendanceRecord[]
}): AdminCalendarEvent {
  const centre = centres.find((item) => item.id === session.centreId)
  const instructor = instructors.find(
    (item) => item.id === session.instructorId,
  )
  return {
    id: session.id,
    session,
    date: parseIsoDate(session.date) ?? new Date(),
    startTime: session.startTime,
    endTime: endTime(session.startTime, session.durationMinutes),
    name: session.title,
    centreName: centre?.name ?? 'Unknown centre',
    instructorName: instructor
      ? `${instructor.firstName} ${instructor.lastName}`
      : 'Unassigned',
    roster: rosterForSession(students, attendance, session),
  }
}
