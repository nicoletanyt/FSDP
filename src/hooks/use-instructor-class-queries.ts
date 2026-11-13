import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'
import { useCallback, useSyncExternalStore } from 'react'
import { useAuth } from './use-auth'
import type { QueryState } from './use-instructor-data'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { parseEntityId } from '@/lib/instructor/adapters'
import { loadCalendarAvailability, loadCalendarEvents } from '@/lib/instructor/calendar-queries'
import { calendarEventId, toCalendarViewEvent, toCalendarViewEvents } from '@/lib/instructor/calendar-view'
import { toInstructorDataError } from '@/lib/instructor/errors'
import { instructorQueryKeys as keys, instructorQueryTimes as times } from '@/lib/instructor/query-keys'
import type { EventId } from '@/lib/instructor/types'

export function useClassQuery<T>(key: QueryKey, load: (signal: AbortSignal) => Promise<T>,
  options: { enabled: boolean; staleTime: number; gcTime: number; retainDuringWrite?: boolean; retainDuringRefresh?: boolean;
    placeholderData?: UseQueryOptions<T, Error, T, QueryKey>['placeholderData'] }) {
  const client = useQueryClient()
  const { retainDuringWrite, retainDuringRefresh, ...queryOptions } = options
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => load(signal), ...queryOptions })
  // Observe explicit invalidation even when a query was already stale. Callers
  // retaining old data must identify it as refreshing, not as authoritative.
  const subscribe = useCallback((notify: () => void) => client.getQueryCache().subscribe(notify), [client])
  const getInvalidated = useCallback(() => client.getQueryState(key)?.isInvalidated ?? false, [client, key])
  const invalidated = useSyncExternalStore(subscribe, getInvalidated, getInvalidated)
  const failure = query.isError ? toInstructorDataError(query.error, 'Unable to load instructor data. Please try again.') : null
  const error = failure?.message ?? null
  const retain = (retainDuringWrite || retainDuringRefresh) && !query.isPlaceholderData && query.data !== undefined
  let state: QueryState<T>
  if (!options.enabled) state = { status: 'loading', data: null, error: null }
  else if (error && !retain) state = { status: 'error', data: null, error }
  else if (query.data === undefined || (invalidated && !retain)) state = { status: 'loading', data: null, error: null }
  else state = { status: 'success', data: query.data, error: null }
  return {
    ...state,
    isFetching: query.isFetching,
    refreshError: error,
    failureCode: failure?.code,
    isPlaceholderData: query.isPlaceholderData,
    retry: () => { void query.refetch() },
    reload: async () => {
      const result = await query.refetch({ cancelRefetch: true, throwOnError: true })
      return result.data!
    },
  }
}

export function useInstructorCalendarRange(range: { from: string; to: string }) {
  const api = useInstructorApi()
  const { session, profile } = useAuth()
  const userId = profile?.role === 'instructor' ? session?.user.id : undefined
  const enabled = Boolean(userId)
  const access = useClassQuery(keys.availabilityAccess(userId ?? ''), signal => api.getAvailabilityAccess(signal),
    { staleTime: 30_000, gcTime: 10 * 60_000, enabled })
  const canUseAvailability = access.status === 'success' && access.data === true
  const events = useClassQuery(keys.calendar(userId ?? '', range.from, range.to),
    signal => loadCalendarEvents(api, range, signal), { ...times.calendar, enabled })
  const availability = useClassQuery(keys.availability(userId ?? '', range.from, range.to),
    signal => loadCalendarAvailability(api, range, signal), { ...times.availability, enabled: enabled && canUseAvailability })
  const classTypes = useClassQuery(keys.classTypes(userId ?? ''), signal => api.getClassTypes(signal), { ...times.reference, enabled })
  const retry = () => { events.retry(); access.retry(); if (canUseAvailability) availability.retry(); classTypes.retry() }
  if (events.status === 'error') return { ...events, retry, canUseAvailability }
  if (access.status === 'error') return { ...access, data: null, retry, canUseAvailability }
  if (canUseAvailability && availability.status === 'error') return { ...availability, retry, canUseAvailability }
  if (classTypes.status === 'error') return { ...classTypes, retry, canUseAvailability }
  if (events.status !== 'success' || access.status !== 'success' || (canUseAvailability && availability.status !== 'success') || classTypes.status !== 'success') {
    return { status: 'loading' as const, data: null, error: null, retry, canUseAvailability }
  }
  return { status: 'success' as const, data: { events: events.data, availability: canUseAvailability ? availability.data ?? [] : [], classTypes: classTypes.data }, error: null, retry, canUseAvailability }
}

export function useInstructorSelectedEvent(id: string | null, enabled: boolean) {
  const api = useInstructorApi()
  const { session, profile } = useAuth()
  const userId = profile?.role === 'instructor' ? session?.user.id : undefined
  return useClassQuery(keys.event(userId ?? '', id ?? ''), async signal => {
    const entry = await api.getEvent(parseEntityId(calendarEventId(id ?? ''), 'event'), signal)
    if (!entry) return null
    // A grading session block resolves to that session; single reads carry no
    // session times, so an unresolvable session is reported as not found.
    return id?.includes(':') ? toCalendarViewEvents(entry).find(event => event.id === id) ?? null : toCalendarViewEvent(entry)
  }, { ...times.event, enabled: Boolean(userId && enabled) })
}

export function useInstructorRoster(eventId: EventId, enabled: boolean) {
  const api = useInstructorApi()
  const { session, profile } = useAuth()
  const userId = profile?.role === 'instructor' ? session?.user.id : undefined
  return useClassQuery(keys.roster(userId ?? '', eventId), signal => api.getAttendanceRoster(eventId, signal),
    { ...times.roster, enabled: Boolean(userId && enabled), retainDuringRefresh: true })
}
