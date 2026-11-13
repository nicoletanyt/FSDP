import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import AttendanceCalendar, { EventCard } from '@/components/admin/AttendanceCalendar'
import FilterPopover, { FilterField } from '@/components/FilterPopover'
import CalendarToolbar from '@/components/calendar/CalendarToolbar'
import type { CalendarDisplayMode, CalendarRange } from '@/components/calendar/CalendarToolbar'
import DayClassDetails from '@/components/instructor/DayClassDetails'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useAuth } from '@/hooks/use-auth'
import { useCalendarShortcuts } from '@/hooks/use-calendar-shortcuts'
import { useMediaQuery } from '@/hooks/use-media-query'
import { addDays, addMonths, dateKey, monthDates, parseIsoDate, weekDates, weekLabel } from '@/lib/admin/attendance-calendar'
import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'
import { loadCalendarCentres, loadCalendarClasses, singaporeDate } from '@/lib/admin/live-class-calendar'
import { sessionTypeStyles } from '@/lib/admin/session-styles'
import { cn } from 'cn'

function unique(values: string[]) {
  return [...new Set(values)].sort().map(value => ({ value, label: value }))
}

export default function LiveAttendanceRegister() {
  const { session } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [searchParams, setSearchParams] = useSearchParams()
  const [now, setNow] = useState(() => new Date())
  const [focusRequest, setFocusRequest] = useState(0)
  const [weekOverview, setWeekOverview] = useState(false)
  const lastSelected = useRef<AdminCalendarEvent | null>(null)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const today = parseIsoDate(singaporeDate(now)) ?? new Date()
  const selectedDate = parseIsoDate(searchParams.get('date')) ?? today
  const view: CalendarRange = searchParams.get('view') === 'day' || searchParams.get('view') === 'month'
    ? searchParams.get('view') as CalendarRange : 'week'
  // Same defaults as the instructor calendar: weeks open as a list, days as a timeline.
  const displayMode: CalendarDisplayMode = view === 'day'
    ? searchParams.get('dayDisplay') === 'list' ? 'list' : 'timeline'
    : searchParams.get('display') === 'timeline' ? 'timeline' : 'list'

  const centresQuery = useQuery({
    queryKey: ['admin', session?.user.id, 'calendar-centres'],
    queryFn: ({ signal }) => loadCalendarCentres(signal),
    enabled: Boolean(session), staleTime: 60_000, retry: false,
  })
  const centres = centresQuery.data ?? []
  // Filters, kept in the URL: dojo (loads only that dojo), class name and instructor.
  const centre = centres.find(item => item.id === searchParams.get('centre')) ?? null
  const titleFilter = searchParams.get('title') ?? ''
  const instructorFilter = searchParams.get('instructor') ?? ''
  const days = view === 'day' ? [selectedDate] : view === 'week' ? weekDates(selectedDate) : monthDates(selectedDate)
  const first = dateKey(days[0])
  const afterLast = dateKey(addDays(days[days.length - 1], 1))
  const classesQuery = useQuery({
    queryKey: ['admin', session?.user.id, 'calendar-classes', centre?.id ?? 'all', first, afterLast],
    queryFn: ({ signal }) => loadCalendarClasses(centres, centre?.id ?? null, first, afterLast, signal),
    enabled: Boolean(session && centresQuery.isSuccess), staleTime: 30_000, refetchInterval: 30_000, retry: false,
  })
  const loadedEvents = classesQuery.data ?? []
  const events = loadedEvents.filter(event =>
    (!titleFilter || event.name === titleFilter) && (!instructorFilter || event.instructorName === instructorFilter))
  const filterFields = [
    { key: 'centre', label: 'Dojo', all: 'All dojos', value: centre?.id ?? '', options: centres.map(item => ({ value: item.id, label: item.name })) },
    { key: 'title', label: 'Class', all: 'All classes', value: titleFilter, options: unique(loadedEvents.map(event => event.name)) },
    { key: 'instructor', label: 'Instructor', all: 'All instructors', value: instructorFilter, options: unique(loadedEvents.map(event => event.instructorName)) },
  ]
  const filterCount = [centre?.id, titleFilter, instructorFilter].filter(Boolean).length
  const selectedEvent = useMemo(() => events.find(item => item.id === searchParams.get('session')), [events, searchParams])
  if (selectedEvent) lastSelected.current = selectedEvent

  function navigate(updates: Record<string, string | null>, overview = false) {
    setWeekOverview(overview)
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (next.toString() !== searchParams.toString()) setSearchParams(next)
  }
  function closeDetails() {
    navigate({ session: null })
  }
  function changeView(nextView: CalendarRange) {
    navigate({ view: nextView, date: dateKey(selectedDate), session: null })
  }
  function changeDisplayMode(mode: CalendarDisplayMode) {
    navigate({ [view === 'day' ? 'dayDisplay' : 'display']: mode, ...(view === 'month' ? { view: 'week' } : {}) })
  }
  function chooseDate(date: Date) {
    if (view === 'month') navigate({ date: dateKey(date), session: null, view: 'day' })
    else navigate({ date: dateKey(date), session: dateKey(date) === dateKey(selectedDate) ? selectedEvent?.id ?? null : null })
  }
  function move(direction: number) {
    if (view !== 'week') {
      const next = view === 'month' ? addMonths(selectedDate, direction) : addDays(selectedDate, direction)
      navigate({ date: dateKey(next), session: null })
      return
    }
    // Moving onto the current week lands on today, like the instructor calendar.
    const next = addDays(selectedDate, direction * 7)
    const includesToday = weekDates(next).some(day => dateKey(day) === dateKey(today))
    navigate({ date: dateKey(includesToday ? today : next), session: null }, !includesToday)
  }
  function goToday() {
    const current = new Date()
    setNow(current)
    setFocusRequest(request => request + 1)
    navigate({ date: singaporeDate(current), session: null })
  }

  useCalendarShortcuts({
    onEscape: () => {
      if (!selectedEvent) return false
      closeDetails()
      return true
    },
    onView: changeView,
    onDisplayMode: changeDisplayMode,
  })

  const heading = view === 'week' ? weekLabel(selectedDate) : selectedDate.toLocaleDateString('en-GB', {
    ...(view === 'day' ? { weekday: 'long', day: 'numeric' } : {}), month: 'long', year: 'numeric',
  })
  const showSidePanel = Boolean(selectedEvent)
  const details = selectedEvent && (
    <EventCard key={selectedEvent.id} event={selectedEvent} layout="panel" expanded onToggle={closeDetails} />
  )

  return (
    <section aria-busy={classesQuery.isFetching} className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
      {centresQuery.isPending && <p role="status" className="text-sm text-muted-foreground">Loading dojos…</p>}
      {centresQuery.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">Unable to load dojos. <Button variant="outline" size="sm" onClick={() => void centresQuery.refetch()}>Retry</Button></div>}
      {centresQuery.isSuccess && !centres.length && <p role="status" className="text-sm text-muted-foreground">No dojos are available.</p>}
      {centresQuery.isSuccess && <>
        <CalendarToolbar
          view={view}
          onViewChange={changeView}
          displayMode={displayMode}
          onDisplayModeChange={changeDisplayMode}
          heading={heading}
          onToday={goToday}
          onPrevious={() => move(-1)}
          onNext={() => move(1)}
          filter={<FilterPopover
            title="Filter classes"
            activeCount={filterCount}
            onReset={() => navigate({ centre: null, title: null, instructor: null, session: null })}
            className="lg:h-10"
          >
            {filterFields.map(({ key, label, options, all, value }) => (
              <FilterField key={key} label={label} value={value} ariaLabel={`${label} filter`}
                onChange={next => navigate({ [key]: next || null, session: null })}
                options={[{ value: '', label: all }, ...options]} />
            ))}
          </FilterPopover>}
          legend={<>
            <p className="-mt-2 text-xs text-muted-foreground">{centre?.name ?? 'All dojos'} · Singapore time</p>
            <ul className="space-y-3 text-xs">
              {Object.entries(sessionTypeStyles).map(([type, style]) => (
                <li key={type} className="grid gap-1 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-center sm:gap-3">
                  <span className={cn('w-fit rounded-full border px-2 py-1 text-[10px] uppercase', style.badge)}>{style.label}</span>
                  <span className="text-muted-foreground">{style.description}</span>
                </li>
              ))}
            </ul>
            <ul className="flex flex-wrap gap-4 border-t pt-3 text-xs text-muted-foreground">
              <li className="flex items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full bg-red-500" />Cover needed</li>
            </ul>
          </>}
        />
        <div className={cn(
          'flex flex-col lg:min-h-0 lg:flex-1',
          showSidePanel && isDesktop && 'lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1 lg:gap-3 lg:overflow-hidden',
        )}>
          {classesQuery.isPending && <p role="status" className="py-4 text-sm text-muted-foreground">Loading classes…</p>}
          {classesQuery.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">Unable to load classes. <Button variant="outline" size="sm" onClick={() => void classesQuery.refetch()}>Retry</Button></div>}
          {classesQuery.isSuccess && <AttendanceCalendar date={selectedDate} today={today} now={now} focusRequest={focusRequest}
            view={view} display={displayMode} events={events} selectedSessionId={selectedEvent?.id ?? null}
            expandSelectedDay={view === 'day' || !weekOverview || Boolean(selectedEvent)}
            onSelectDate={chooseDate}
            onToggleSession={event => navigate({ date: event.session.date,
              session: selectedEvent?.id === event.id ? null : event.id })} />}
          {isDesktop && details && (view === 'day'
            ? <DayClassDetails onClose={closeDetails}>{details}</DayClassDetails>
            : <aside aria-label="Calendar selection details" className="flex min-h-0 min-w-0 flex-col overflow-hidden">{details}</aside>)}
        </div>
      </>}
      {!isDesktop && <Drawer open={showSidePanel} onOpenChange={(open) => { if (!open) closeDetails() }}>
        <DrawerContent>
          <DrawerHeader>
            <div className="min-w-0">
              <DrawerTitle className="text-[18px] font-semibold">Class details</DrawerTitle>
              <DrawerDescription className="text-[13px] text-muted-foreground">
                {lastSelected.current?.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </DrawerDescription>
            </div>
            <DrawerClose render={<Button variant="ghost" className="h-11 rounded-full px-3 text-[15px] text-primary" />}>Done</DrawerClose>
          </DrawerHeader>
          <DrawerBody className="pb-[max(1rem,env(safe-area-inset-bottom))]">
            {lastSelected.current && <EventCard key={lastSelected.current.id} event={lastSelected.current} layout="panel" expanded onToggle={closeDetails} />}
          </DrawerBody>
        </DrawerContent>
      </Drawer>}
    </section>
  )
}
