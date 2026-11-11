import type { createInstructorApi } from './api'
import { collectCalendarPages } from './page-collector'
import { toCalendarAvailability, toCalendarViewEvents } from './calendar-view'

export type InstructorApi = ReturnType<typeof createInstructorApi>
export { collectCalendarPages } from './page-collector'

export function needsCalendarEventLookup(requestedId: string | null, hasDate: boolean,
  calendarStatus: 'loading' | 'success' | 'error', isInRange: boolean) {
  return Boolean(requestedId && (!hasDate || (calendarStatus !== 'loading' && !isInRange)))
}

export async function loadCalendarEvents(api: InstructorApi, range: { from: string; to: string }, signal: AbortSignal) {
  const events = await collectCalendarPages(options => api.getCalendar({ ...options,
    from: `${range.from}T00:00:00+08:00`, to: `${range.to}T00:00:00+08:00`,
  }), entry => entry.event.id, signal)
  return events.flatMap(toCalendarViewEvents)
}

export async function loadCalendarAvailability(api: InstructorApi, range: { from: string; to: string }, signal: AbortSignal) {
  const availability = await collectCalendarPages(options => api.getAvailability({ ...options, ...range }), slot => slot.id, signal)
  return availability.map(toCalendarAvailability)
}

export async function loadCalendarRange(api: InstructorApi, range: { from: string; to: string }, signal: AbortSignal) {
  const [events, availability, classTypes] = await Promise.all([
    loadCalendarEvents(api, range, signal),
    loadCalendarAvailability(api, range, signal),
    api.getClassTypes(signal),
  ])
  return { events, availability, classTypes }
}
