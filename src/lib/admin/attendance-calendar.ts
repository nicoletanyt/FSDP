import { toIsoDate } from './format'
import type { Session, Student } from './types'

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
  /** Live calendar events display an authoritative roster count, not mock students. */
  rosterCount?: number
  liveDetails?: {
    eventId: string
    status: string
    classType: string
    startsAt: string
    endsAt: string
    unavailability?: { id: string; status: string; notification_status: string; created_at: string; reportedBy: string;
      notification_http_status: number | null; notification_failure_reason: string | null } | null
  }
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

export function addMonths(date: Date, amount: number): Date {
  const month = new Date(date.getFullYear(), date.getMonth() + amount, 1)
  const lastDay = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate()
  return new Date(
    month.getFullYear(),
    month.getMonth(),
    Math.min(date.getDate(), lastDay),
  )
}

export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7))
}

export function weekDates(date: Date): Date[] {
  return Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeek(date), index),
  )
}

export function monthDates(date: Date): Date[] {
  const start = startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1))
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  const end = addDays(startOfWeek(lastDay), 6)
  const days: Date[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day)
  return days
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

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`
}

export function timeMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export const TIMELINE_START = 8 * 60
export const TIMELINE_END = 22 * 60

/**
 * Assign a lane to every interval, including transitive overlap groups.
 * Adjacent intervals can share a lane; overlapping intervals never do.
 */
export function layoutTimelineItems<
  T extends { id: string; startTime: string; endTime: string },
>(items: T[]) {
  const sorted = [...items].sort(
    (left, right) =>
      timeMinutes(left.startTime) - timeMinutes(right.startTime) ||
      timeMinutes(right.endTime) - timeMinutes(left.endTime),
  )
  const result: { item: T; lane: number; lanes: number }[] = []
  let group: typeof result = []
  let laneEnds: number[] = []
  let groupEnd = -1
  function flush() {
    for (const entry of group) entry.lanes = laneEnds.length
    result.push(...group)
    group = []
    laneEnds = []
    groupEnd = -1
  }
  for (const item of sorted) {
    const start = timeMinutes(item.startTime)
    const end = timeMinutes(item.endTime)
    if (start >= groupEnd) flush()
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = end
    group.push({ item, lane, lanes: 1 })
    groupEnd = Math.max(groupEnd, end)
  }
  flush()
  return result
}
