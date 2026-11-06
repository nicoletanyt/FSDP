import { InstructorDataError } from './errors'
import type { Page, PageOptions } from './types'

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
