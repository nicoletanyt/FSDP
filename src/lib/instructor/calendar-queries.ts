import type { createInstructorApi } from './api'
import { InstructorDataError } from './errors'
import { toCalendarAvailability, toCalendarViewEvent } from './calendar-view'
import type { Page, PageOptions } from './types'

export type InstructorApi = ReturnType<typeof createInstructorApi>

export async function collectCalendarPages<T>(
  load: (options: PageOptions) => Promise<Page<T> | null>,
  key: (item: T) => string,
  signal: AbortSignal,
): Promise<T[]> {
  const items: T[] = []
  const seen = new Set<string>()
  let total: number | undefined
  do {
    signal.throwIfAborted()
    const page = await load({ offset: items.length, limit: 100, signal })
    signal.throwIfAborted()
    if (!page) throw new InstructorDataError('invalid_data', 'The selected session is no longer available.')
    if ((total !== undefined && page.total !== total) || page.offset !== items.length
        || (!page.items.length && items.length < page.total)) {
      throw new InstructorDataError('request_failed', 'The calendar records changed while loading. Please retry.')
    }
    total = page.total
    for (const item of page.items) {
      const id = key(item)
      if (seen.has(id)) throw new InstructorDataError('request_failed', 'The calendar records changed while loading. Please retry.')
      seen.add(id)
      items.push(item)
    }
  } while (items.length < total)
  if (items.length !== total) throw new InstructorDataError('request_failed', 'The calendar records changed while loading. Please retry.')
  return items
}

export async function loadCalendarRange(api: InstructorApi, range: { from: string; to: string }, signal: AbortSignal) {
  const [events, availability, classTypes] = await Promise.all([
    collectCalendarPages(options => api.getCalendar({ ...options,
      from: `${range.from}T00:00:00+08:00`, to: `${range.to}T00:00:00+08:00`,
    }), entry => entry.event.id, signal),
    collectCalendarPages(options => api.getAvailability({ ...options, ...range }), slot => slot.id, signal),
    api.getClassTypes(signal),
  ])
  return { events: events.map(toCalendarViewEvent), availability: availability.map(toCalendarAvailability), classTypes }
}
