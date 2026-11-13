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

// Where a grading is in its lifecycle: applications open → close → sorted into
// sessions → grading day. Shared by the schedule and grading day pages so both
// use the same words.
export type GradingStageKey = 'not-open' | 'open' | 'unsorted' | 'sorted' | 'started' | 'done'
export interface GradingStageInput {
  opensOn: string | null
  closesOn: string | null
  gradingDate: string
  sessions: number
  started: boolean
  today?: string
}

export function gradingStage({ opensOn, closesOn, gradingDate: date, sessions, started, today = singaporeToday() }: GradingStageInput) {
  const inDays = (to: string) => { const n = daysUntil(to, today); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days` }
  if (date < today) return { key: 'done' as const, text: 'Grading finished' }
  if (started) return { key: 'started' as const, text: 'Grading in progress. Sessions are locked.' }
  if (opensOn && today < opensOn) return { key: 'not-open' as const, text: `Applications open ${inDays(opensOn)}, on ${gradingDate(opensOn)}` }
  if (closesOn && today <= closesOn) return { key: 'open' as const, text: `Applications close ${inDays(closesOn)}, on ${gradingDate(closesOn)}` }
  if (!sessions) return { key: 'unsorted' as const, text: 'Ready to sort into sessions' }
  return { key: 'sorted' as const, text: `Sorted into ${sessions === 1 ? '1 session' : `${sessions} sessions`}. Grading ${inDays(date)}.` }
}

export const daysUntil = (date: string, today = singaporeToday()) =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)

// Whether a time falls after a Singapore wall-clock time such as '21:00'.
export function endsAfter(value: string, clock: string) {
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }) > clock
}
