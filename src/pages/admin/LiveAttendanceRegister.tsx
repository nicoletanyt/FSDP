import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronLeft, ChevronRight, List } from 'lucide-react'
import { useSearchParams } from 'react-router'
import AttendanceCalendar from '@/components/admin/AttendanceCalendar'
import type { CalendarDisplay, CalendarView } from '@/components/admin/AttendanceCalendar'
import AttendanceSessionPanel from '@/components/admin/AttendanceSessionPanel'
import CentreCombobox from '@/components/admin/CentreCombobox'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { addDays, addMonths, dateKey, monthDates, parseIsoDate, weekDates, weekLabel } from '@/lib/admin/attendance-calendar'
import { loadCalendarCentres, loadCalendarClasses, singaporeDate } from '@/lib/admin/live-class-calendar'

export default function LiveAttendanceRegister() {
  const { session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const today = parseIsoDate(singaporeDate(now)) ?? new Date()
  const selectedDate = parseIsoDate(searchParams.get('date')) ?? today
  const view: CalendarView = searchParams.get('view') === 'day' || searchParams.get('view') === 'month'
    ? searchParams.get('view') as CalendarView : 'week'
  const display: CalendarDisplay = searchParams.get('display') === 'list' ? 'list' : 'timeline'

  const centresQuery = useQuery({
    queryKey: ['admin', session?.user.id, 'calendar-centres'],
    queryFn: ({ signal }) => loadCalendarCentres(signal),
    enabled: Boolean(session), staleTime: 60_000, retry: false,
  })
  const centres = centresQuery.data ?? []
  const centreId = searchParams.get('centre')
  const centre = centres.find(item => item.id === centreId) ?? centres[0]
  const days = view === 'day' ? [selectedDate] : view === 'week' ? weekDates(selectedDate) : monthDates(selectedDate)
  const first = dateKey(days[0])
  const afterLast = dateKey(addDays(days[days.length - 1], 1))
  const classesQuery = useQuery({
    queryKey: ['admin', session?.user.id, 'calendar-classes', centre?.id, first, afterLast],
    queryFn: ({ signal }) => loadCalendarClasses(centre!, first, afterLast, signal),
    enabled: Boolean(session && centre), staleTime: 30_000, refetchInterval: 30_000, retry: false,
  })
  const events = classesQuery.data ?? []
  const selectedEvent = useMemo(() => events.find(item => item.id === searchParams.get('session')), [events, searchParams])

  function navigate(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setSearchParams(next)
  }
  function chooseDate(date: Date) {
    navigate({ date: dateKey(date), session: null, view: view === 'month' ? 'day' : view })
  }
  function move(amount: number) {
    const next = view === 'month' ? addMonths(selectedDate, amount) : addDays(selectedDate, amount * (view === 'week' ? 7 : 1))
    navigate({ date: dateKey(next), session: null })
  }

  const heading = view === 'week' ? weekLabel(selectedDate) : selectedDate.toLocaleDateString('en-GB', {
    ...(view === 'day' ? { weekday: 'long', day: 'numeric' } : {}), month: 'long', year: 'numeric',
  })
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <h1 className="text-3xl font-semibold tracking-tight">Calendar</h1>
      {centresQuery.isPending && <p role="status" className="text-sm text-muted-foreground">Loading dojos…</p>}
      {centresQuery.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">Unable to load dojos. <Button variant="outline" size="sm" onClick={() => void centresQuery.refetch()}>Retry</Button></div>}
      {centresQuery.isSuccess && !centres.length && <p role="status" className="text-sm text-muted-foreground">No dojos are available.</p>}
      {centre && <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CentreCombobox id="attendance-centre" centres={centres} value={centre.id}
              onChange={id => navigate({ centre: id, session: null })} ariaLabel="Calendar dojo"
              includeAll={false} className="h-10 w-56" />
            <Button variant="outline" onClick={() => navigate({ date: dateKey(today), session: null })}>Today</Button>
            <Button variant="ghost" size="icon-lg" aria-label={`Previous ${view}`} onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></Button>
            <Button variant="ghost" size="icon-lg" aria-label={`Next ${view}`} onClick={() => move(1)}><ChevronRight aria-hidden="true" /></Button>
            <h2 className="text-sm font-medium" aria-live="polite">{heading}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Calendar date range" className="flex gap-1">
              {(['day', 'week', 'month'] as const).map(nextView =>
                <Button key={nextView} size="sm" variant={view === nextView ? 'secondary' : 'outline'}
                  aria-pressed={view === nextView} onClick={() => navigate({ view: nextView, session: null })}
                  className="capitalize">{nextView}</Button>)}
            </div>
            {view !== 'month' && <div role="group" aria-label="Calendar display mode" className="flex gap-1">
              <Button size="sm" variant={display === 'timeline' ? 'secondary' : 'outline'} aria-pressed={display === 'timeline'} onClick={() => navigate({ display: 'timeline' })}><CalendarDays aria-hidden="true" /> Timeline</Button>
              <Button size="sm" variant={display === 'list' ? 'secondary' : 'outline'} aria-pressed={display === 'list'} onClick={() => navigate({ display: 'list' })}><List aria-hidden="true" /> List</Button>
            </div>}
          </div>
        </div>
        {classesQuery.isPending && <p role="status" className="py-4 text-sm text-muted-foreground">Loading classes for {centre.name}…</p>}
        {classesQuery.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">Unable to load classes for {centre.name}. <Button variant="outline" size="sm" onClick={() => void classesQuery.refetch()}>Retry</Button></div>}
        {classesQuery.isSuccess && <div className={selectedEvent
          ? 'flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden'
          : 'flex min-h-0 flex-1 flex-col'}>
          <AttendanceCalendar date={selectedDate} today={today} now={now} view={view} display={display}
            events={events} selectedSessionId={selectedEvent?.id ?? null} expandSelectedDay
            onSelectDate={chooseDate}
            onToggleSession={event => navigate({ centre: event.session.centreId, date: event.session.date,
              session: selectedEvent?.id === event.id ? null : event.id })} />
          {selectedEvent && <AttendanceSessionPanel event={selectedEvent} onClose={() => navigate({ session: null })} dayView={view === 'day'} />}
        </div>}
      </>}
    </div>
  )
}
