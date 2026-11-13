import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { addDays } from '@/lib/instructor-calendar'
import { calendarDateValue, calendarRange } from '@/lib/instructor/calendar-view'
import type { CalendarViewEvent } from '@/lib/instructor/calendar-view'
import { createInstructorPrefetcher, nextUpcomingClass } from '@/lib/instructor/prefetch'

export function useInstructorPrefetch(options: {
  selectedDate: Date; today: Date; range: { from: string; to: string }; events: CalendarViewEvent[];
  ready: boolean; weekView: boolean; isDesktop: boolean; mobileList: boolean;
}) {
  const client = useQueryClient()
  const api = useInstructorApi()
  const { session, profile } = useAuth()
  const userId = profile?.role === 'instructor' ? session?.user.id : undefined
  const prefetch = useMemo(() => createInstructorPrefetcher(client, api, userId ?? ''), [client, api, userId])
  const hover = useRef<ReturnType<typeof setTimeout> | null>(null)
  const automaticallyPrefetched = useRef(new Set<string>())
  const selectedDay = calendarDateValue(options.selectedDate)
  const today = calendarDateValue(options.today)
  const previous = calendarRange(addDays(options.selectedDate, -7), 'week', options.isDesktop, options.mobileList)
  const next = calendarRange(addDays(options.selectedDate, 7), 'week', options.isDesktop, options.mobileList)
  const nextClass = options.ready && options.range.from <= today && today < options.range.to
    ? nextUpcomingClass(options.events, today, Date.now()) : null

  useEffect(() => {
    automaticallyPrefetched.current.clear()
    return () => { if (hover.current) clearTimeout(hover.current) }
  }, [prefetch])

  useEffect(() => {
    if (!options.ready || !options.weekView) return
    void prefetch.range({ from: previous.from, to: previous.to })
    void prefetch.range({ from: next.from, to: next.to })
  }, [prefetch, options.ready, options.weekView, selectedDay, previous.from, previous.to, next.from, next.to])

  useEffect(() => {
    if (!nextClass || !prefetch.allowed()) return
    const key = `${today}:${nextClass.id}`
    if (automaticallyPrefetched.current.has(key)) return
    automaticallyPrefetched.current.add(key)
    void prefetch.roster(nextClass.id)
  }, [prefetch, today, nextClass?.id])

  const cancelHover = useCallback(() => {
    if (hover.current) clearTimeout(hover.current)
    hover.current = null
  }, [])
  const hoverClass = useCallback((id: string) => {
    cancelHover()
    if (!prefetch.allowed()) return
    hover.current = setTimeout(() => { hover.current = null; void prefetch.roster(id) }, 150)
  }, [prefetch, cancelHover])
  const touchClass = useCallback((id: string) => {
    cancelHover()
    void prefetch.roster(id)
  }, [prefetch, cancelHover])
  return { hoverClass, cancelHover, touchClass }
}
