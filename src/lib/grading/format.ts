// Shared date/time wording for the instructor and admin grading pages.
// Every grading happens in Singapore, so times are always shown in its zone.
const timeZone = 'Asia/Singapore'

export const singaporeToday = () =>
  new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short' }).format(new Date())

// "Sat, 14 Nov 2026" on cards; "Saturday, 14 November 2026" on detail pages.
export function gradingDate(value: string, style: 'short' | 'long' = 'short') {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-SG', style === 'long'
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone }
    : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone })
}

export const gradingTime = (value: string) =>
  new Date(value).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', timeZone })

export function gradingTimeRange(startsAt: string | null, endsAt: string | null) {
  return startsAt && endsAt ? `${gradingTime(startsAt)} – ${gradingTime(endsAt)}` : null
}

// A clock time such as "10:30:00" stored without a date.
export const clockTime = (value: string) => gradingTime(`2026-01-01T${value.slice(0, 5)}:00+08:00`)

// The session's own time, else its published reporting time.
export function gradingTimeLabel(startsAt: string | null, endsAt: string | null, reportingTime?: string | null) {
  return gradingTimeRange(startsAt, endsAt)
    ?? (reportingTime ? `Reporting ${clockTime(reportingTime)}` : 'Time to be confirmed')
}

export const gradingStamp = (value: string) =>
  new Intl.DateTimeFormat('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value))

export const candidateCount = (count: number) => (count === 1 ? '1 candidate' : `${count} candidates`)
