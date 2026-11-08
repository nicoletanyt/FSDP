import type { QueryClient } from '@tanstack/react-query'
import { parseEntityId, toSingaporeDateTime } from './adapters'
import { loadCalendarAvailability, loadCalendarEvents } from './calendar-queries'
import type { InstructorApi } from './calendar-queries'
import type { CalendarViewEvent } from './calendar-view'
import { instructorQueryKeys as keys, instructorQueryTimes as times } from './query-keys'
import { queryGeneration } from '../query-generation'

type Range = { from: string; to: string }

export function dataSaverEnabled() {
  if (typeof navigator === 'undefined') return false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return connection?.saveData === true
}

export function nextUpcomingClass(events: CalendarViewEvent[], today: string, now: number) {
  return events.filter(event => event.type === 'training' && event.status === 'scheduled' && event.startsAt
    && toSingaporeDateTime(event.startsAt).date === today && Date.parse(event.startsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt!) - Date.parse(b.startsAt!))[0] ?? null
}

export function createInstructorPrefetcher(client: QueryClient, api: InstructorApi, userId: string) {
  const generation = queryGeneration(client)
  const allowed = () => Boolean(userId) && queryGeneration(client) === generation && !dataSaverEnabled()

  return {
    allowed,
    async range(range: Range) {
      if (!allowed()) return
      await Promise.all([
        client.prefetchQuery({ queryKey: keys.calendar(userId, range.from, range.to),
          queryFn: ({ signal }) => loadCalendarEvents(api, range, signal), ...times.calendar, retry: false }),
        client.prefetchQuery({ queryKey: keys.availability(userId, range.from, range.to),
          queryFn: ({ signal }) => loadCalendarAvailability(api, range, signal), ...times.availability, retry: false }),
      ])
    },
    async roster(eventId: CalendarViewEvent['id']) {
      if (!allowed()) return
      let id
      try { id = parseEntityId(eventId, 'event') } catch { return }
      await client.prefetchQuery({ queryKey: keys.roster(userId, id),
        queryFn: ({ signal }) => api.getAttendanceRoster(id, signal), ...times.roster, retry: false })
    },
  }
}
