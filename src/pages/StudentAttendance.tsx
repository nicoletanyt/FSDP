import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router'
import { CalendarDays, Clock3, MapPin, UserRound, X } from 'lucide-react'
import CalendarToolbar from '@/components/shared/calendar/CalendarToolbar'
import type { CalendarDisplayMode } from '@/components/shared/calendar/CalendarToolbar'
import ClassDetailsOverlay from '@/components/shared/calendar/ClassDetailsOverlay'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import FilterPopover, { FilterField } from '@/components/shared/filters/FilterPopover'
import PageHeader from '@/components/shared/layout/PageHeader'
import AttendanceCalendar, { attendanceClassStyle, statusText, StatusPill } from '@/components/student/AttendanceCalendar'
import type { AttendanceDisplay, AttendanceEntry, AttendanceView } from '@/components/student/AttendanceCalendar'
import MobileStudentCalendar from '@/components/student/MobileStudentCalendar'
import type { MobileStudentMode } from '@/components/student/MobileStudentCalendar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCalendarShortcuts } from '@/hooks/use-calendar-shortcuts'
import { useFeedback } from '@/hooks/use-feedback'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useWeekSpan } from '@/hooks/use-week-span'
import { stepWeekWindow, visibleWeekDays, windowLabel } from '@/lib/calendar-window'
import { addDays, addMonths, classTypes, dateKey, weekDates } from '@/lib/instructor-calendar'
import type { StudentContext } from '@/layouts/StudentLayout'
import { dateTime, formatTime, prettyDate } from '@/lib/student-schedule'
import { cn } from '@/lib/utils'

/**
 * The height from an element's top to the bottom of the window, less the page's
 * bottom padding, so a calendar fills the rest of the screen like the admin one.
 * Re-measured on resize and whenever the content above it changes height.
 */
function useFillHeight(enabled: boolean, bottomGap = 32, minimum = 420) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!enabled || !element) {
      setHeight(null)
      return
    }
    const measure = () => {
      const top = element.getBoundingClientRect().top + window.scrollY
      setHeight(Math.max(minimum, Math.floor(window.innerHeight - top - bottomGap)))
    }
    measure()
    window.addEventListener('resize', measure)
    // Anything above the calendar changing height moves its top.
    const observer = new ResizeObserver(measure)
    if (element.parentElement) observer.observe(element.parentElement)
    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [enabled, bottomGap, minimum])
  return { ref, height }
}

type Pending =
  | { kind: 'cancel'; id: string }
  | { kind: 'leave'; id: string }

const emptyFilters = { centre: '', title: '', instructor: '', status: '' }

export default function StudentAttendance() {
  const { classes, schedule } = useOutletContext<StudentContext>()

  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<AttendanceView>('week')
  // Same defaults as the admin calendar: weeks open as a list, days as a timeline.
  const [weekDisplay, setWeekDisplay] = useState<AttendanceDisplay>('list')
  const [dayDisplay, setDayDisplay] = useState<AttendanceDisplay>('timeline')
  const [filters, setFilters] = useState(emptyFilters)
  // Same breakpoints as the admin calendar: below 785px the phone layout; the
  // side panel needs 1200px, narrower screens use the bottom sheet.
  const wide = useMediaQuery('(min-width: 785px)')
  const desktop = useMediaQuery('(min-width: 1200px)')
  const weekSpan = useWeekSpan()
  const display = view === 'day' ? dayDisplay : weekDisplay
  const fillArea = useFillHeight(wide)
  const [pending, setPending] = useState<Pending | null>(null)
  const { notify, feedbackDialog } = useFeedback()
  function report(error: string | null | undefined, title: string, description: string) {
    notify(error ? { variant: 'error', title: 'Something went wrong', description: error } : { title, description })
  }

  const entries = useMemo(
    (): AttendanceEntry[] =>
      schedule.enrollments
        .flatMap(e => {
          const session = classes.find(c => c.id === e.id)

          return session ? [{ ...e, session }] : []
        })
        .sort(
          (a, b) =>
            dateTime(a.session).getTime() -
            dateTime(b.session).getTime()
        ),
    [classes, schedule.enrollments]
  )

  const waiting = classes.filter(
    c => schedule.waitlist.includes(c.id)
  )

  const filterFields = [
    { key: 'centre', label: 'Dojo', all: 'All dojos', options: classes.map(session => session.centre) },
    { key: 'title', label: 'Class', all: 'All classes', options: classes.map(session => session.title) },
    { key: 'instructor', label: 'Instructor', all: 'All instructors', options: classes.map(session => session.instructor) },
    { key: 'status', label: 'Attendance status', all: 'All statuses', options: ['Enrolled', 'Waitlisted', 'Make-up class', 'Attended', 'Absent', 'Late', 'Excused', 'Cancelled', 'Past · not marked'] }
  ] as const
  const filterCount = Object.values(filters).filter(Boolean).length

  function matchesFilters(entry: AttendanceEntry) {
    return (!filters.centre || entry.session.centre === filters.centre)
      && (!filters.title || entry.session.title === filters.title)
      && (!filters.instructor || entry.session.instructor === filters.instructor)
      && (!filters.status || statusText(entry) === filters.status)
  }

  // Waitlist places show on the calendar too, with their own pill.
  const waitlistEntries: AttendanceEntry[] = waiting.map(session => ({ id: session.id, status: 'waitlisted', session }))
  const calendarSource = [...entries, ...waitlistEntries]
  const calendarEntries = new Map<string, AttendanceEntry[]>()
  for (const entry of calendarSource.filter(matchesFilters)) {
    const key = dateKey(entry.session.date)
    const day = calendarEntries.get(key) ?? []
    day.push(entry)
    calendarEntries.set(key, day)
  }

  const today = new Date()
  const visibleDays = visibleWeekDays(selectedDate, today, weekDates(selectedDate), weekSpan, addDays)
  const selectedEntry = calendarSource.find(entry => entry.id === selectedId)

  const heading = view === 'week'
    ? windowLabel(visibleDays)
    : selectedDate.toLocaleDateString('en-GB', {
      ...(view === 'day' ? { weekday: 'long', day: 'numeric' } : {}), month: 'long', year: 'numeric',
    })

  function changeView(next: AttendanceView) {
    setView(next)
    setSelectedId(null)
  }

  function changeDisplayMode(mode: CalendarDisplayMode) {
    if (view === 'day') setDayDisplay(mode)
    else {
      setWeekDisplay(mode)
      // Choosing a display from the month goes back to the week, as on the admin calendar.
      if (view === 'month') setView('week')
    }
    setSelectedId(null)
  }

  // Phones: the same Day / List / Month views as the admin and instructor calendars.
  const mobileMode: MobileStudentMode =
    view === 'month' ? 'month' : view === 'day' || display === 'timeline' ? 'day' : 'list'
  function changeMobileMode(mode: MobileStudentMode) {
    setSelectedId(null)
    if (mode === 'month') setView('month')
    else if (mode === 'day') {
      setView('day')
      setDayDisplay('timeline')
    } else {
      setView('week')
      setWeekDisplay('list')
    }
  }

  useCalendarShortcuts({
    disabled: Boolean(pending),
    onEscape: () => {
      if (!selectedId) return false
      setSelectedId(null)
      return true
    },
    onView: changeView,
    onDisplayMode: changeDisplayMode,
  })

  function selectDate(date: Date) {
    setSelectedDate(date)
    setSelectedId(null)
  }

  function selectEntry(entry: AttendanceEntry) {
    if (selectedId === entry.id) {
      setSelectedId(null)
      return
    }
    setSelectedDate(entry.session.date)
    setSelectedId(entry.id)
  }

  // Clicking a date in the month opens that day, as on the admin calendar.
  function chooseDate(date: Date) {
    if (view === 'month') {
      setView('day')
      selectDate(date)
    } else setSelectedDate(date)
  }

  function navigateDate(direction: number) {
    if (view !== 'week') {
      selectDate(view === 'month' ? addMonths(selectedDate, direction) : addDays(selectedDate, direction))
      return
    }
    // Moving onto the current week lands on today, like the admin calendar.
    const next = stepWeekWindow(selectedDate, direction === 1 ? 1 : -1, today, weekSpan, addDays)
    const includesToday = visibleWeekDays(next, today, weekDates(next), weekSpan, addDays).some(day => dateKey(day) === dateKey(today))
    selectDate(includesToday ? today : next)
  }

  async function confirm() {
    if (!pending) return

    if (pending.kind === 'cancel') {
      const error = await schedule.cancel(pending.id)
      if (!error) setSelectedId(null)
      report(error, 'Booking cancelled', 'Your booking for this class has been cancelled.')
    } else if (pending.kind === 'leave') {
      const error = await schedule.leaveWaitlist(pending.id)
      report(error, 'Left waitlist', 'You have been removed from the waitlist.')
    }

    setPending(null)
  }

  /**
   * A class's details, styled like the instructor calendar's panel: the class
   * colour behind the name and key facts, then plain sections and the actions.
   */
  function detailsPanel(e: AttendanceEntry, onClose?: () => void) {
    const future = dateTime(e.session).getTime() > Date.now()
    const booked = future && (e.status === 'enrolled' || e.status === 'make-up')
    const waitlisted = future && e.status === 'waitlisted'
    const fact = 'flex items-center gap-1.5 text-xs opacity-85'
    return (
      <Card size="sm" className={cn(
        'h-full min-h-0 gap-0 rounded-lg border py-0 shadow-none ring-0',
        attendanceClassStyle(e.session.classType ?? e.session.title),
      )}>
        <div className="shrink-0 space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 text-lg leading-tight font-semibold wrap-break-word sm:text-xl">{e.session.title}</h2>
            {onClose && (
              <Button variant="ghost" size="icon-sm" aria-label="Close class details" onClick={onClose}
                className="-mt-1 -mr-1 shrink-0 text-inherit hover:bg-foreground/10 hover:text-inherit">
                <X aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className={fact}><CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />{prettyDate(e.session.date)}</span>
            <span className={fact}><Clock3 aria-hidden="true" className="size-3.5 shrink-0" />{formatTime(e.session.startTime)} – {formatTime(e.session.endTime)}</span>
          </div>
          <span className={fact}><MapPin aria-hidden="true" className="size-3.5 shrink-0" /><span className="min-w-0 wrap-break-word">{e.session.centre}</span></span>
          <span className={fact}><UserRound aria-hidden="true" className="size-3.5 shrink-0" /><span className="min-w-0 truncate">{e.session.instructor}</span></span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background text-foreground">
          <section className="flex shrink-0 items-center justify-between gap-2 border-t border-foreground/10 px-3 py-2.5">
            <h3 className="text-sm font-medium">{e.status === 'waitlisted' ? 'Booking' : 'Attendance'}</h3>
            <StatusPill entry={e} className="ring-foreground/15" />
          </section>
          {e.session.level && (
            <section className="shrink-0 space-y-1 border-t border-foreground/10 px-3 py-2.5">
              <h3 className="text-sm font-medium">Class level</h3>
              <p className="text-sm text-muted-foreground">{e.session.level}</p>
            </section>
          )}
          {waitlisted && (
            <p className="shrink-0 border-t border-foreground/10 px-3 py-2.5 text-xs text-muted-foreground">
              Being waitlisted does not guarantee a spot.
            </p>
          )}
          {(booked || waitlisted) && (
            <div className="mt-auto flex shrink-0 flex-wrap gap-2 border-t border-foreground/10 px-3 py-3">
              {booked ? (
                <Button size="sm" variant="outline" onClick={() => setPending({ kind: 'cancel', id: e.id })}>
                  Cancel booking
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setPending({ kind: 'leave', id: e.id })}>
                  Leave waitlist
                </Button>
              )}
            </div>
          )}
        </div>
      </Card>
    )
  }

  const legend = (
    <ul className="flex flex-wrap gap-2">
      {Object.values(classTypes).map(style => (
        <li key={style.label} className={cn('rounded-md border px-2 py-1 text-xs', style.badge)}>{style.label}</li>
      ))}
    </ul>
  )

  const filter = (
    <FilterPopover
      title="Filter classes"
      activeCount={filterCount}
      onReset={() => {
        setFilters(emptyFilters)
        setSelectedId(null)
      }}
      className="lg:h-10"
    >
      {filterFields.map(({ key, label, all, options }) => (
        <FilterField
          key={key}
          label={label}
          ariaLabel={`${label} filter`}
          value={filters[key]}
          onChange={value => {
            setFilters(previous => ({ ...previous, [key]: value }))
            setSelectedId(null)
          }}
          options={[{ value: '', label: all }, ...[...new Set(options)].sort().map(option => ({ value: option, label: option }))]}
        />
      ))}
    </FilterPopover>
  )

  const details = selectedEntry && (
    <aside aria-label="Class details" className="flex min-h-0 min-w-0 flex-col">
      {detailsPanel(selectedEntry, () => setSelectedId(null))}
    </aside>
  )

  return (
    <div className="space-y-4">
      <PageHeader title="My schedule" />

      {wide ? (
        <>
          <CalendarToolbar
            view={view}
            onViewChange={changeView}
            displayMode={display}
            onDisplayModeChange={changeDisplayMode}
            heading={heading}
            onToday={() => selectDate(new Date())}
            onPrevious={() => navigateDate(-1)}
            onNext={() => navigateDate(1)}
            legend={legend}
            filter={filter}
          />
          <div ref={fillArea.ref} style={fillArea.height ? { height: fillArea.height } : undefined}
            className={cn('grid min-w-0 gap-3', fillArea.height ? 'grid-rows-[minmax(0,1fr)]' : 'items-start',
              selectedEntry && desktop && 'grid-cols-[minmax(0,1fr)_320px]')}>
            <AttendanceCalendar
              fill={Boolean(fillArea.height)}
              date={selectedDate}
              today={today}
              view={view}
              display={display}
              days={visibleDays}
              entriesByDate={calendarEntries}
              selectedId={selectedId}
              onSelectDate={chooseDate}
              onSelectEntry={selectEntry}
            />
            {desktop && details}
          </div>
        </>
      ) : (
        <>
          {/* The header has no tinted band here, so its contents line up with the page title. */}
          <div>
          <MobileStudentCalendar
            mode={mobileMode}
            date={selectedDate}
            today={today}
            entriesByDate={calendarEntries}
            selectedId={selectedId}
            filter={filter}
            legend={legend}
            onChangeMode={changeMobileMode}
            onSelectDate={selectDate}
            onToday={() => selectDate(new Date())}
            onSelectEntry={selectEntry}
          />
          </div>
        </>
      )}

      {waiting.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>My waitlists</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {waiting.map(c => (
                <div
                  key={c.id}
                  className="rounded-lg border p-3"
                >
                  <p className="font-medium">
                    {c.title}
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {prettyDate(c.date)} ·{' '}
                    {formatTime(c.startTime)} · {c.centre}
                  </p>

                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setPending({
                        kind: 'leave',
                        id: c.id
                      })
                    }
                  >
                    Leave waitlist
                  </Button>
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Being waitlisted does not guarantee a spot.
              Check Classes for an available spot.
            </p>
          </CardContent>
        </Card>
      )}

      {!desktop && (
        <ClassDetailsOverlay open={Boolean(selectedEntry) && !pending} onClose={() => setSelectedId(null)}
          title="Class details" description={selectedEntry && prettyDate(selectedEntry.session.date)}>
          {selectedEntry && detailsPanel(selectedEntry)}
        </ClassDetailsOverlay>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={open => { if (!open) setPending(null) }}
        pending={schedule.saving}
        destructive
        title={pending?.kind === 'leave' ? 'Leave this waitlist?' : 'Cancel this booking?'}
        description={pending?.kind === 'leave'
          ? 'Your name will be removed from the waitlist.'
          : 'Your place in this class will be released.'}
        cancelLabel={pending?.kind === 'leave' ? 'Stay on waitlist' : 'Keep booking'}
        confirmLabel={pending?.kind === 'leave' ? 'Leave waitlist' : 'Cancel booking'}
        onConfirm={confirm}
      />
      {feedbackDialog}
    </div>
  )
}
