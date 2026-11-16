import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { CalendarClock, CalendarDays, CalendarRange, CircleCheck, Clock, Clock3, Hourglass, List, MapPin, Plus, UserRound, X } from 'lucide-react'
import MobileCalendarHeader from '@/components/shared/calendar/MobileCalendarHeader'
import type { MobileViewOption } from '@/components/shared/calendar/MobileCalendarHeader'
import WeekStrip from '@/components/shared/calendar/WeekStrip'
import CalendarToolbar from '@/components/shared/calendar/CalendarToolbar'
import type { CalendarDisplayMode } from '@/components/shared/calendar/CalendarToolbar'
import StatCard from '@/components/shared/layout/StatCard'
import { useCalendarShortcuts } from '@/hooks/use-calendar-shortcuts'
import AttendanceCalendar, { attendanceClassStyle } from '@/components/student/AttendanceCalendar'
import type { AttendanceEntry, AttendanceView } from '@/components/student/AttendanceCalendar'
import ClassDetailsOverlay from '@/components/shared/calendar/ClassDetailsOverlay'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useFeedback } from '@/hooks/use-feedback'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { addDays, addMonths, classTypes, dateKey, weekDates, weekLabel } from '@/lib/instructor-calendar'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/shared/layout/PageHeader'
import { StatusBadge, type BadgeTone } from '@/components/shared/status/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { StudentContext } from '@/layouts/StudentLayout'
import {
  dateTime,
  formatTime,
  prettyDate
} from '@/lib/student-schedule'
import FilterPopover, { FilterField } from '@/components/shared/filters/FilterPopover'

type Pending =
  | { kind: 'cancel'; id: string }
  | { kind: 'leave'; id: string }

const statusText = (e: AttendanceEntry) => {
  if (e.status === 'attended') return 'Attended'
  if (e.status === 'missed') return 'Absent'
  if (e.status === 'late') return 'Late'
  if (e.status === 'excused') return 'Excused'
  if (e.status === 'cancelled') return 'Cancelled'
  if (dateTime(e.session).getTime() <= Date.now()) return 'Past · not marked'
  return e.status === 'make-up' ? 'Make-up class' : 'Enrolled'
}

const statusTones: Record<string, BadgeTone> = {
  Attended: 'success',
  Late: 'warning',
  Absent: 'danger',
  Enrolled: 'info',
  'Make-up class': 'info',
}

type MobileView = AttendanceView | 'list'
const mobileViews: MobileViewOption<MobileView>[] = [
  { value: 'day', label: 'Day', icon: Clock },
  { value: 'week', label: 'Week', icon: CalendarRange },
  { value: 'month', label: 'Month', icon: CalendarDays },
  { value: 'list', label: 'List', icon: List },
]

const emptyFilters = { centre: '', title: '', instructor: '', status: '' }

export default function StudentAttendance() {
  const { classes, schedule } = useOutletContext<StudentContext>()

  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<AttendanceView>('week')
  const [list, setList] = useState(false)
  const [filters, setFilters] = useState(emptyFilters)
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [pending, setPending] = useState<Pending | null>(null)
  const { notify, feedbackDialog } = useFeedback()
  function report(error: string | null | undefined, title: string, description: string) {
    notify(error ? { variant: 'error', title: 'Something went wrong', description: error } : { title, description })
  }

  const entries = useMemo(
    () =>
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

  const upcoming = entries.filter(
    e =>
      dateTime(e.session).getTime() > Date.now() &&
      (e.status === 'enrolled' || e.status === 'make-up')
  )

  const past = entries.filter(
    e =>
      dateTime(e.session).getTime() <= Date.now() ||
      (e.status !== 'enrolled' && e.status !== 'make-up')
  )

  const waiting = classes.filter(
    c => schedule.waitlist.includes(c.id)
  )

  const filterFields = [
    { key: 'centre', label: 'Dojo', all: 'All dojos', options: classes.map(session => session.centre) },
    { key: 'title', label: 'Class', all: 'All classes', options: classes.map(session => session.title) },
    { key: 'instructor', label: 'Instructor', all: 'All instructors', options: classes.map(session => session.instructor) },
    { key: 'status', label: 'Attendance status', all: 'All statuses', options: ['Enrolled', 'Make-up class', 'Attended', 'Absent', 'Late', 'Excused', 'Cancelled', 'Past · not marked'] }
  ] as const
  const filterCount = Object.values(filters).filter(Boolean).length

  function matchesFilters(entry: AttendanceEntry) {
    return (!filters.centre || entry.session.centre === filters.centre)
      && (!filters.title || entry.session.title === filters.title)
      && (!filters.instructor || entry.session.instructor === filters.instructor)
      && (!filters.status || statusText(entry) === filters.status)
  }

  const calendarEntries = new Map<string, AttendanceEntry[]>()
  for (const entry of entries.filter(matchesFilters)) {
    const key = dateKey(entry.session.date)
    const day = calendarEntries.get(key) ?? []
    day.push(entry)
    calendarEntries.set(key, day)
  }

  const today = new Date()
  const dayEntries = calendarEntries.get(dateKey(selectedDate)) ?? []
  const selectedEntry = entries.find(entry => entry.id === selectedId)

  const heading = view === 'month'
    ? selectedDate.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })
    : view === 'week' && desktop ? weekLabel(selectedDate) : prettyDate(selectedDate)

  function changeView(next: AttendanceView) {
    setView(next)
    // The month view is always a calendar.
    if (next === 'month') setList(false)
    setSelectedId(null)
  }

  function changeDisplayMode(mode: CalendarDisplayMode) {
    if (view === 'month') return
    setList(mode === 'list')
    setSelectedId(null)
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
    if (desktop) setSelectedDate(entry.session.date)
    setSelectedId(entry.id)
  }

  function navigateDate(direction: number) {
    const days = view === 'week' && desktop ? 7 : 1
    selectDate(view === 'month'
      ? addMonths(selectedDate, direction)
      : addDays(selectedDate, direction * days))
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

  function rows(items: AttendanceEntry[], detail = false) {
    if (!items.length) return null

    return items.map(e => {
      const future =
        dateTime(e.session).getTime() > Date.now() &&
        (e.status === 'enrolled' || e.status === 'make-up')

      return (
        <div key={e.id} className={detail ? 'flex min-h-full flex-col' : 'border-b py-4 last:border-0'}>
          <div className={detail ? cn(
            attendanceClassStyle(e.session.classType ?? e.session.title),
            'border-b border-border bg-linear-to-r from-card/80 to-card/80 p-3 pr-9 text-card-foreground dark:text-card-foreground'
          ) : undefined}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className={detail ? 'text-lg leading-tight font-semibold' : 'font-semibold'}>
                  {e.session.title}
                </p>
                <p className={cn('mt-1 text-xs', !detail && 'text-muted-foreground')}>
                  {prettyDate(e.session.date)}
                </p>
              </div>

              {!detail && <StatusBadge tone={statusTones[statusText(e)] ?? 'neutral'}>{statusText(e)}</StatusBadge>}
            </div>

            <p className={cn('mt-2 flex items-center gap-2 text-sm', !detail && 'text-muted-foreground')}>
              <Clock3 aria-hidden="true" className="size-4" />
              {formatTime(e.session.startTime)}
              {' – '}
              {formatTime(e.session.endTime)}
            </p>

            <p className={cn('mt-1 flex items-center gap-2 text-sm', !detail && 'text-muted-foreground')}>
              <MapPin aria-hidden="true" className="size-4" />
              {e.session.centre}
            </p>

            {detail && (
              <p className="mt-1 flex items-center gap-2 text-sm">
                <UserRound className="size-4" aria-hidden="true" />
                {e.session.instructor}
              </p>
            )}
          </div>

          {detail && (
            <dl className="divide-y text-sm">
              <div className="space-y-1 p-3">
                <dt className="text-xs text-muted-foreground">Attendance</dt>
                <dd className="font-medium">{statusText(e)}</dd>
              </div>
              <div className="space-y-1 p-3">
                <dt className="text-xs text-muted-foreground">Class level</dt>
                <dd>{e.session.level}</dd>
              </div>
            </dl>
          )}

          {future && (
            <div className={cn('flex flex-wrap gap-2', detail ? 'mt-auto border-t p-3' : 'mt-3')}>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPending({
                    kind: 'cancel',
                    id: e.id
                  })
                }
              >
                Cancel booking
              </Button>
            </div>
          )}
        </div>
      )
    })
  }

  const stats = (
    <section aria-label="Key figures" className="grid grid-cols-3 gap-2 sm:gap-3">
      <StatCard label="Upcoming" value={String(upcoming.length)} icon={CalendarClock} />
      <StatCard label="Attended" value={String(past.filter(e => e.status === 'attended' || e.status === 'late').length)} icon={CircleCheck} tone="success" />
      <StatCard label="Waitlisted" value={String(waiting.length)} icon={Hourglass} />
    </section>
  )

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

  function entryButton(entry: AttendanceEntry) {
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => selectEntry(entry)}
        className={cn(
          'block min-h-11 w-full rounded-md border-l-[3px] p-2 text-left text-sm hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring',
          attendanceClassStyle(entry.session.classType ?? entry.session.title)
        )}
      >
        <span className="block font-semibold">{entry.session.title}</span>
        <span>{formatTime(entry.session.startTime)} · {statusText(entry)}</span>
      </button>
    )
  }

  // Phones show the week as a list of days; seven timeline columns do not fit.
  const weekAgenda = (
    <div aria-label="Classes this week" className="min-w-0 space-y-4">
      {weekDates(selectedDate).map(day => {
        const items = calendarEntries.get(dateKey(day)) ?? []
        return (
          <section key={dateKey(day)} className="space-y-2">
            <h2 className={cn(
              'flex items-baseline justify-between border-b py-2 text-sm font-semibold',
              dateKey(day) === dateKey(today) && 'text-brand-red-ink'
            )}>
              <span>{day.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}</span>
              <span className="text-xs font-normal text-muted-foreground">{items.length === 1 ? '1 class' : `${items.length} classes`}</span>
            </h2>
            {items.length ? items.map(entryButton) : <p className="text-sm text-muted-foreground">No classes</p>}
          </section>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-3">
      {desktop ? (
        <>
          <PageHeader title="My schedule" />
          {stats}
      <CalendarToolbar
            view={view}
            onViewChange={changeView}
            displayMode={list ? 'list' : 'timeline'}
            onDisplayModeChange={changeDisplayMode}
            heading={heading}
            onToday={() => selectDate(new Date())}
            onPrevious={() => navigateDate(-1)}
            onNext={() => navigateDate(1)}
            actions={(
              <Button variant="outline" nativeButton={false} render={<Link to="/classes" />} className="h-11 lg:h-10">
                <Plus aria-hidden="true" /> Browse classes
              </Button>
            )}
            legend={legend}
            filter={filter}
          />
        </>
      ) : (
        <>
          {/* Same phone header and week strip as the instructor and administrator calendars. */}
          <div className="-mx-2 -mt-2">
            <MobileCalendarHeader
              date={selectedDate}
              view={list ? 'list' : view}
              views={mobileViews}
              onViewChange={next => {
                if (next === 'list') {
                  if (view === 'month') setView('week')
                  setList(true)
                  setSelectedId(null)
                } else {
                  setList(false)
                  changeView(next)
                }
              }}
              stepUnit={view === 'month' ? 'month' : 'day'}
              onToday={() => selectDate(new Date())}
              onPrevious={() => navigateDate(-1)}
              onNext={() => navigateDate(1)}
              extras={(
                <>
                  <Button variant="ghost" size="icon-touch" nativeButton={false} render={<Link to="/classes" />} aria-label="Browse classes">
                    <Plus aria-hidden="true" />
                  </Button>
                  {filter}
                </>
              )}
              legendTitle="Class colours"
              legend={legend}
            />
          </div>
          {!list && view !== 'month' && <WeekStrip date={selectedDate} today={today} onSelectDate={selectDate} />}
        </>
      )}

      {!list ? (
        <div className={cn(
          'grid min-w-0 items-start gap-3',
          (view === 'month' || selectedEntry) && 'lg:grid-cols-[minmax(0,1fr)_clamp(13rem,20%,18rem)]'
        )}>
          {!desktop && view === 'week' ? weekAgenda : <AttendanceCalendar
            date={selectedDate}
            today={today}
            view={view}
            entriesByDate={calendarEntries}
            selectedId={selectedId}
            onSelectDate={selectDate}
            onSelectEntry={selectEntry}
          />}

          {desktop && selectedEntry ? (
            <aside aria-label="Class details" className={cn(
              'relative min-w-0 overflow-auto rounded-xl border bg-card',
              view !== 'month' && 'lg:h-[clamp(24rem,calc(100dvh-15rem),56rem)]'
            )}>
              <Button variant="ghost" size="icon-sm" aria-label="Close class details" onClick={() => setSelectedId(null)} className="absolute top-2 right-2 z-10">
                <X aria-hidden="true" />
              </Button>
              {rows([selectedEntry], true)}
            </aside>
          ) : view === 'month' && (
            <Card className="min-w-0 gap-2">
              <CardHeader><CardTitle>{prettyDate(selectedDate)}</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dayEntries.map(entryButton)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming classes</CardTitle>
            </CardHeader>
            <CardContent>{rows(upcoming.filter(matchesFilters))}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Past attendance</CardTitle>
            </CardHeader>
            <CardContent>
              {rows(past.filter(matchesFilters))}
              <p className="mt-2 text-xs text-muted-foreground">
                Actual attendance must be recorded by an instructor.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {!desktop && stats}

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
          {selectedEntry && rows([selectedEntry])}
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
