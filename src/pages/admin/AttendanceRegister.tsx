import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays as CalendarDaysIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  List,
  Plus,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import AttendanceCalendar from '@/components/admin/AttendanceCalendar'
import type {
  CalendarDisplay,
  CalendarView,
} from '@/components/admin/AttendanceCalendar'
import AttendanceSessionPanel from '@/components/admin/AttendanceSessionPanel'
import CentreCombobox from '@/components/admin/CentreCombobox'
import SessionFormDialog from '@/components/admin/SessionFormDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import {
  addDays,
  addMonths,
  buildCalendarEvent,
  dateKey,
  monthDates,
  parseIsoDate,
  weekDates,
  weekLabel,
} from '@/lib/admin/attendance-calendar'
import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'
import { fullName, startOfDay, toIsoDate } from '@/lib/admin/format'
import { sessionTypeStyles } from '@/lib/admin/session-styles'
import type { Session } from '@/lib/admin/types'
import { cn } from 'cn'

function latestFirst(left: Session, right: Session) {
  return `${right.date}T${right.startTime}`.localeCompare(
    `${left.date}T${left.startTime}`,
  )
}

function earliestByDate(left: Session, right: Session) {
  return (
    `${left.date}T${left.startTime}`.localeCompare(
      `${right.date}T${right.startTime}`,
    ) || left.title.localeCompare(right.title)
  )
}

export default function AttendanceRegister() {
  const { centres, instructors, students, sessions, attendance } = useAdminData()
  const { centreId: filterCentreId, setCentreId } = useAdminFilters()
  const [searchParams, setSearchParams] = useSearchParams()
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [weekOverview, setWeekOverview] = useState(false)
  const [timelineFocusRequest, setTimelineFocusRequest] = useState(0)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const today = useMemo(() => startOfDay(now), [now])
  const todayKey = toIsoDate(today)

  const viewParam = searchParams.get('view')
  const legacyList = viewParam === 'list'
  const view: CalendarView =
    viewParam === 'day' || viewParam === 'month' ? viewParam : 'week'
  const displayParam = searchParams.get('display')
  const display: CalendarDisplay =
    legacyList ||
    displayParam === 'list' ||
    (displayParam === 'table' && view !== 'month')
      ? 'list'
      : 'timeline'

  useEffect(() => {
    if (!legacyList && displayParam !== 'table') return
    const next = new URLSearchParams(searchParams)
    if (legacyList) next.set('view', 'week')
    next.set('display', legacyList || view !== 'month' ? 'list' : 'timeline')
    setSearchParams(next, { replace: true })
  }, [legacyList, displayParam, view, searchParams, setSearchParams])

  const sessionParam = searchParams.get('session')
  const dateParam = searchParams.get('date')
  const centreParam = searchParams.get('centre')
  const studentParam = searchParams.get('student')

  const focusStudent = studentParam
    ? students.find((student) => student.id === studentParam)
    : undefined
  const requestedSession = sessionParam
    ? sessions.find((session) => session.id === sessionParam)
    : undefined
  const requestedDate = useMemo(() => parseIsoDate(dateParam), [dateParam])

  const centreOptions = useMemo(
    () =>
      centres.filter((centre) =>
        sessions.some((session) => session.centreId === centre.id) ||
        (centre.id === centreParam && centre.status !== 'closed'),
      ),
    [centres, sessions, centreParam],
  )

  const candidateCentreId =
    requestedSession?.centreId ??
    (focusStudent && !centreParam
      ? focusStudent.homeCentreId
      : centreParam) ??
    (filterCentreId !== 'all' ? filterCentreId : undefined) ??
    centreOptions[0]?.id ??
    ''
  const selectedCentreId = centreOptions.some(
    (centre) => centre.id === candidateCentreId,
  )
    ? candidateCentreId
    : (centreOptions[0]?.id ?? '')

  const centreSessions = useMemo(
    () =>
      sessions.filter((session) => session.centreId === selectedCentreId),
    [sessions, selectedCentreId],
  )

  const fallbackDate = useMemo(() => {
    if (requestedDate) return requestedDate
    if (focusStudent && !centreParam) {
      const recordedSessions = new Set(
        attendance
          .filter((record) => record.studentId === focusStudent.id)
          .map((record) => record.sessionId),
      )
      const latestRecorded = centreSessions
        .filter(
          (session) =>
            session.date <= todayKey && recordedSessions.has(session.id),
        )
        .sort(latestFirst)[0]
      if (latestRecorded)
        return parseIsoDate(latestRecorded.date) ?? today
    }
    const latestPast = centreSessions
      .filter((session) => session.date <= todayKey)
      .sort(latestFirst)[0]
    if (latestPast) return parseIsoDate(latestPast.date) ?? today
    const first = [...centreSessions].sort(earliestByDate)[0]
    return parseIsoDate(first?.date) ?? today
  }, [
    requestedDate,
    focusStudent,
    centreParam,
    centreSessions,
    attendance,
    todayKey,
    today,
  ])

  const selectedDate = useMemo(
    () =>
      requestedSession
        ? (parseIsoDate(requestedSession.date) ?? fallbackDate)
        : fallbackDate,
    [requestedSession, fallbackDate],
  )
  const selectedSession = requestedSession

  const calendarEvents = useMemo(() => {
    const range =
      view === 'day'
        ? [selectedDate]
        : view === 'week'
          ? weekDates(selectedDate)
          : monthDates(selectedDate)
    const keys = new Set(range.map(dateKey))
    return centreSessions
      .filter((session) => keys.has(session.date))
      .map((session) =>
        buildCalendarEvent({
          session,
          centres,
          instructors,
          students,
          attendance,
        }),
      )
  }, [
    view,
    selectedDate,
    centreSessions,
    centres,
    instructors,
    students,
    attendance,
  ])

  const selectedEvent = useMemo(() => {
    if (!selectedSession) return undefined
    return (
      calendarEvents.find((event) => event.id === selectedSession.id) ??
      buildCalendarEvent({
        session: selectedSession,
        centres,
        instructors,
        students,
        attendance,
      })
    )
  }, [
    selectedSession,
    calendarEvents,
    centres,
    instructors,
    students,
    attendance,
  ])

  function commit(
    updates: {
      centre?: string | null
      date?: Date | null
      session?: string | null
      view?: CalendarView
      display?: CalendarDisplay
    },
    { clearStudent = true }: { clearStudent?: boolean } = {},
  ) {
    const next = new URLSearchParams(searchParams)
    if (clearStudent) next.delete('student')

    const centreId =
      updates.centre === undefined ? selectedCentreId : updates.centre
    if (centreId) next.set('centre', centreId)
    else next.delete('centre')

    const date = updates.date === undefined ? selectedDate : updates.date
    if (date) next.set('date', dateKey(date))
    else next.delete('date')

    const sessionId =
      updates.session === undefined
        ? (selectedSession?.id ?? null)
        : updates.session
    if (sessionId) next.set('session', sessionId)
    else next.delete('session')

    next.set('view', updates.view ?? view)
    next.set('display', updates.display ?? display)
    if (next.toString() !== searchParams.toString()) setSearchParams(next)
  }

  function clearStudentFocus() {
    const next = new URLSearchParams(searchParams)
    next.delete('student')
    setSearchParams(next)
  }

  function selectDay(date: Date) {
    const sameDay = dateKey(date) === dateKey(selectedDate)
    commit({
      date,
      session: sameDay ? (selectedSession?.id ?? null) : null,
    })
    setWeekOverview(false)
  }

  function selectCalendarDate(date: Date) {
    if (view === 'month') {
      commit({
        date,
        session: null,
        view: 'day',
      })
      setWeekOverview(false)
      return
    }
    selectDay(date)
  }

  function toggleSession(event: AdminCalendarEvent) {
    commit({
      centre: event.session.centreId,
      date: event.date,
      session: selectedSession?.id === event.id ? null : event.id,
    })
    setWeekOverview(false)
  }

  function goToday() {
    setTimelineFocusRequest((request) => request + 1)
    commit({ date: today, session: null })
    setWeekOverview(false)
  }

  function navigateDate(direction: number) {
    if (view === 'month') {
      commit({ date: addMonths(selectedDate, direction), session: null })
      return
    }
    if (view === 'day') {
      commit({ date: addDays(selectedDate, direction), session: null })
      return
    }
    const nextDate = addDays(selectedDate, direction * 7)
    const includesToday = weekDates(nextDate).some(
      (day) => dateKey(day) === todayKey,
    )
    commit({
      date: includesToday ? today : nextDate,
      session: null,
    })
    setWeekOverview(!includesToday)
  }

  function handleCentreChange(nextCentreId: string) {
    const scoped = sessions.filter(
      (session) => session.centreId === nextCentreId,
    )
    const latest =
      scoped.filter((session) => session.date <= todayKey).sort(latestFirst)[0] ??
      [...scoped].sort(earliestByDate)[0]
    commit({
      centre: nextCentreId,
      date: latest ? (parseIsoDate(latest.date) ?? today) : today,
      session: null,
    })
    setWeekOverview(false)
    if (nextCentreId !== filterCentreId) setCentreId(nextCentreId)
  }

  function changeView(nextView: unknown) {
    if (nextView !== 'day' && nextView !== 'week' && nextView !== 'month')
      return
    if (nextView === view) return
    commit({ view: nextView })
    if (nextView !== 'month') setWeekOverview(false)
  }

  function changeDisplay(nextDisplay: unknown) {
    if (nextDisplay !== 'timeline' && nextDisplay !== 'list') return
    if (nextDisplay === display) return
    commit({
      display: nextDisplay,
      view: view === 'month' ? 'week' : view,
    })
    setWeekOverview(false)
  }

  useEffect(() => {
    function handleCalendarShortcut(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        newSessionOpen
      )
        return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, [role="textbox"], [role="combobox"]',
          ))
      )
        return
      const hasOpenOverlay = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"], [role="alertdialog"], [role="menu"]',
        ),
      ).some((overlay) => {
        if (
          overlay.closest('[hidden], [inert], [aria-hidden="true"], [data-closed]')
        )
          return false
        const style = window.getComputedStyle(overlay)
        return (
          overlay.getClientRects().length > 0 &&
          style.visibility === 'visible' &&
          style.opacity !== '0'
        )
      })
      if (hasOpenOverlay) return

      const key = event.key.toLowerCase()
      if (key === 'escape' && selectedSession) {
        event.preventDefault()
        commit({ session: null })
        return
      }
      if (key === 'd' || key === 'w' || key === 'm') {
        event.preventDefault()
        changeView(key === 'd' ? 'day' : key === 'w' ? 'week' : 'month')
        return
      }
      if (key === 't' || key === 'l') {
        event.preventDefault()
        const nextDisplay =
          key === 't' ? ('timeline' as const) : ('list' as const)
        commit({
          display: nextDisplay,
          view: view === 'month' ? 'week' : view,
          session: null,
        })
        setWeekOverview(false)
      }
    }

    window.addEventListener('keydown', handleCalendarShortcut)
    return () => window.removeEventListener('keydown', handleCalendarShortcut)
  }, [
    newSessionOpen,
    selectedSession,
    view,
    display,
    selectedDate,
    selectedCentreId,
    searchParams,
    setSearchParams,
  ])

  if (!selectedCentreId) {
    return (
      <>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No sessions found. Create a session before recording attendance.
            </p>
            <Button variant="outline" onClick={() => setNewSessionOpen(true)}>
              Create session
            </Button>
          </CardContent>
        </Card>
        <SessionFormDialog
          open={newSessionOpen}
          onOpenChange={setNewSessionOpen}
          defaultCentreId={selectedCentreId || 'all'}
        />
      </>
    )
  }

  const heading =
    view === 'week'
      ? weekLabel(selectedDate)
      : selectedDate.toLocaleDateString('en-GB', {
          ...(view === 'day' ? { weekday: 'long', day: 'numeric' } : {}),
          month: 'long',
          year: 'numeric',
        })

  const showSidePanel = selectedEvent !== undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <h1 className="shrink-0 text-3xl font-semibold tracking-tight">
        Calendar
      </h1>
      {focusStudent && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
          <p>
            Showing attendance for{' '}
            <span className="font-medium">{fullName(focusStudent)}</span>
            <span className="text-muted-foreground">
              {' '}
              · {focusStudent.currentGrade}
            </span>
          </p>
          <Link
            to={`/admin/students/${focusStudent.id}`}
            className="rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            View profile
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearStudentFocus}
            className="ml-auto h-7 px-2 text-xs"
          >
            Clear
          </Button>
        </div>
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <CentreCombobox
            id="attendance-centre"
            centres={centreOptions}
            value={selectedCentreId}
            onChange={handleCentreChange}
            ariaLabel="Attendance centre"
            includeAll={false}
            className="h-10 w-56 cursor-pointer"
          />
          <div
            role="group"
            aria-label={`${view[0].toUpperCase()}${view.slice(1)} navigation`}
            className="flex items-center gap-2"
          >
            <Button
              variant="outline"
              onClick={goToday}
              className="mr-1 h-10 px-4"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-10"
              aria-label={`Previous ${view}`}
              onClick={() => navigateDate(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-10"
              aria-label={`Next ${view}`}
              onClick={() => navigateDate(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <h2 className="text-sm font-medium" aria-live="polite">
            {heading}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setNewSessionOpen(true)}
            className="h-10 gap-2 px-4"
          >
            <Plus aria-hidden="true" />
            New session
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="h-10 min-w-28 justify-between gap-3 px-4"
                />
              }
              aria-label={`Calendar date range: ${view}`}
            >
              {view[0].toUpperCase()}
              {view.slice(1)}
              <ChevronDown aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="p-1.5">
              <DropdownMenuRadioGroup
                value={view}
                onValueChange={changeView}
                aria-label="Calendar date range"
              >
                <DropdownMenuRadioItem
                  value="day"
                  closeOnClick
                  aria-keyshortcuts="d"
                  className="py-2.5 pr-4 pl-9"
                >
                  Day
                  <Kbd className="ml-auto" aria-hidden="true">
                    D
                  </Kbd>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="week"
                  closeOnClick
                  aria-keyshortcuts="w"
                  className="py-2.5 pr-4 pl-9"
                >
                  Week
                  <Kbd className="ml-auto" aria-hidden="true">
                    W
                  </Kbd>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="month"
                  closeOnClick
                  aria-keyshortcuts="m"
                  className="py-2.5 pr-4 pl-9"
                >
                  Month
                  <Kbd className="ml-auto" aria-hidden="true">
                    M
                  </Kbd>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {view !== 'month' && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-10 min-w-32 justify-between gap-3 px-4"
                  />
                }
                aria-label={`Calendar display mode: ${display}`}
              >
                {display === 'timeline' ? (
                  <CalendarDaysIcon aria-hidden="true" />
                ) : (
                  <List aria-hidden="true" />
                )}
                {display === 'timeline' ? 'Timeline' : 'List'}
                <ChevronDown aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="p-1.5">
                <DropdownMenuRadioGroup
                  aria-label="Calendar display mode"
                  value={display}
                  onValueChange={changeDisplay}
                >
                  <DropdownMenuRadioItem
                    value="timeline"
                    closeOnClick
                    aria-keyshortcuts="t"
                    className="gap-3 py-2.5 pr-4 pl-9"
                  >
                    <CalendarDaysIcon aria-hidden="true" className="size-4" />
                    Timeline
                    <Kbd className="ml-auto" aria-hidden="true">
                      T
                    </Kbd>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value="list"
                    closeOnClick
                    aria-keyshortcuts="l"
                    className="gap-3 py-2.5 pr-4 pl-9"
                  >
                    <List aria-hidden="true" className="size-4" />
                    List
                    <Kbd className="ml-auto" aria-hidden="true">
                      L
                    </Kbd>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Popover>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-lg" className="size-10" />
              }
              aria-label="Calendar information"
              title="Calendar information"
            >
              <Info aria-hidden="true" className="size-5" />
            </PopoverTrigger>
            <PopoverContent className="max-h-[min(36rem,calc(100dvh-3rem))] w-96 overflow-y-auto">
              <PopoverTitle>Calendar legend</PopoverTitle>
              <p className="-mt-2 text-xs text-muted-foreground">
                Sessions · attendance saves as you mark students
              </p>
              <ul className="space-y-3 text-xs">
                {Object.entries(sessionTypeStyles).map(([type, style]) => (
                  <li
                    key={type}
                    className="grid grid-cols-[9.5rem_minmax(0,1fr)] items-center gap-3"
                  >
                    <span
                      className={cn(
                        'w-fit rounded-full border px-2 py-1 text-[10px] uppercase',
                        style.badge,
                      )}
                    >
                      {style.label}
                    </span>
                    <span className="text-muted-foreground">
                      {style.description}
                    </span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          showSidePanel &&
            (view === 'day'
              ? 'gap-3 overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1'
              : 'grid grid-cols-1 grid-rows-[repeat(2,minmax(320px,1fr))] gap-3 overflow-y-auto overscroll-contain lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-1 lg:overflow-hidden'),
        )}
      >
        <AttendanceCalendar
          date={selectedDate}
          today={today}
          now={now}
          focusRequest={timelineFocusRequest}
          view={view}
          display={display}
          events={calendarEvents}
          selectedSessionId={selectedSession?.id ?? null}
          expandSelectedDay={
            view === 'day' || !weekOverview || selectedSession !== null
          }
          onSelectDate={selectCalendarDate}
          onToggleSession={toggleSession}
        />
        {selectedEvent && (
          <AttendanceSessionPanel
            event={selectedEvent}
            focusStudentId={focusStudent?.id}
            onClose={() => commit({ session: null })}
            dayView={view === 'day'}
          />
        )}
      </div>

      <SessionFormDialog
        open={newSessionOpen}
        onOpenChange={setNewSessionOpen}
        defaultCentreId={selectedCentreId}
      />
    </div>
  )
}
