import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import { Clock3, MapPin, Plus, SlidersHorizontal, UserRound, X } from 'lucide-react'
import AttendanceCalendar, { attendanceClassStyle, AttendanceToolbar } from '@/components/student/AttendanceCalendar'
import type { AttendanceEntry, AttendanceView } from '@/components/student/AttendanceCalendar'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { useMediaQuery } from '@/hooks/use-media-query'
import { addDays, addMonths, dateKey } from '@/lib/instructor-calendar'
import { cn } from '@/lib/utils'
import { Button } from '@/components/student/button'
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
import type { ClassOffering } from '@/lib/student-schedule'

type Pending =
  | { kind: 'cancel'; id: string }
  | { kind: 'leave'; id: string }
  | {
      kind: 'reschedule'
      id: string
      replacement: ClassOffering
    }

const statusText = (e: AttendanceEntry) => {
  if (e.status === 'attended') return 'Attended'
  if (e.status === 'missed') return 'Absent'
  if (e.status === 'late') return 'Late'
  if (e.status === 'excused') return 'Excused'
  if (e.status === 'cancelled') return 'Cancelled'
  if (dateTime(e.session).getTime() <= Date.now()) return 'Past · not marked'
  return e.status === 'make-up' ? 'Make-up class' : 'Enrolled'
}

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
  const [rescheduleId, setRescheduleId] = useState<string | null>(
    null
  )
  const [replacementId, setReplacementId] = useState('')
  const [message, setMessage] = useState('')

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
    { key: 'centre', label: 'Centre', options: classes.map(session => session.centre) },
    { key: 'title', label: 'Class', options: classes.map(session => session.title) },
    { key: 'instructor', label: 'Instructor', options: classes.map(session => session.instructor) },
    { key: 'status', label: 'Attendance status', options: ['Enrolled', 'Make-up class', 'Attended', 'Absent', 'Late', 'Excused', 'Cancelled', 'Past · not marked'] }
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

  const alternatives = classes
    .filter(
      c =>
        c.id !== rescheduleId &&
        dateTime(c).getTime() > Date.now() &&
        c.bookable && !schedule.isBooked(c.id) && !schedule.isFull(c)
    )
    .slice(0, 50)

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
      setMessage(error ?? 'Class booking cancelled.')
    } else if (pending.kind === 'leave') {
      const error = await schedule.leaveWaitlist(pending.id)
      setMessage(error ?? 'Removed from waitlist.')
    } else if (pending.kind === 'reschedule') {
      const error = await schedule.reschedule(
        pending.id,
        pending.replacement
      )

      setMessage(
        error ??
        `Class moved to ${prettyDate(pending.replacement.date)}.`
      )

      if (!error) {
        selectDate(pending.replacement.date)
        setRescheduleId(null)
        setReplacementId('')
      }
    }

    setPending(null)
  }

  function rows(items: AttendanceEntry[], detail = false) {
    if (!items.length) {
      return (
        <p className="py-5 text-sm text-muted-foreground">
          No classes for this selection.
        </p>
      )
    }

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

              {!detail && <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">{statusText(e)}</span>}
            </div>

            <p className={cn('mt-2 flex items-center gap-2 text-sm', !detail && 'text-muted-foreground')}>
              <Clock3 className="size-4" />
              {formatTime(e.session.startTime)}
              {' – '}
              {formatTime(e.session.endTime)}
            </p>

            <p className={cn('mt-1 flex items-center gap-2 text-sm', !detail && 'text-muted-foreground')}>
              <MapPin className="size-4" />
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
                disabled={!schedule.active}
                onClick={() => {
                  setRescheduleId(e.id)
                  setReplacementId('')
                }}
              >
                Reschedule
              </Button>

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
                Cancel class
              </Button>
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="relative left-1/2 w-[min(94vw,1440px)] -translate-x-1/2 space-y-3 lg:w-[min(88vw,1440px)]">
      <h2 className="text-2xl font-semibold tracking-tight lg:text-3xl">Your calendar</h2>

      {message && (
        <p
          role="status"
          className="rounded-lg border bg-muted px-4 py-3 text-sm"
        >
          {message}
        </p>
      )}

      <AttendanceToolbar
        date={selectedDate}
        view={view}
        list={list}
        desktop={desktop}
        actions={(
          <>
            <Button variant="outline" nativeButton={false} render={<Link to="/classes" />} className="h-10">
              <Plus aria-hidden="true" /> Browse classes
            </Button>
            <Popover>
              <PopoverTrigger render={<Button variant="outline" className="h-10" />}>
                <SlidersHorizontal aria-hidden="true" />
                Filters{filterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{filterCount}</span>}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <div className="flex items-center justify-between gap-2">
                  <PopoverTitle>Calendar filters</PopoverTitle>
                  <Button variant="ghost" size="sm" disabled={!filterCount} onClick={() => {
                    setFilters(emptyFilters)
                    setSelectedId(null)
                  }}>Reset</Button>
                </div>
                {filterFields.map(({ key, label, options }) => (
                  <div key={key} className="grid gap-1 text-sm">
                    <label htmlFor={`attendance-filter-${key}`} className="font-medium">{label}</label>
                    <select
                      id={`attendance-filter-${key}`}
                      value={filters[key]}
                      onChange={event => {
                        const value = event.target.value
                        setFilters(previous => ({ ...previous, [key]: value }))
                        setSelectedId(null)
                      }}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 font-normal focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <option value="">All</option>
                      {[...new Set(options)].sort().map(option => <option key={option}>{option}</option>)}
                    </select>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </>
        )}
        onViewChange={nextView => {
          setView(nextView)
          setList(false)
          setSelectedId(null)
        }}
        onListChange={nextList => {
          setList(nextList)
          setSelectedId(null)
        }}
        onNavigate={navigateDate}
        onToday={() => selectDate(new Date())}
      />

      {!list ? (
        <div className={cn(
          'grid min-w-0 items-start gap-3',
          (view === 'month' || selectedEntry) && 'lg:grid-cols-[minmax(0,1fr)_clamp(13rem,20%,18rem)]'
        )}>
          <AttendanceCalendar
            date={selectedDate}
            today={today}
            view={view}
            desktop={desktop}
            entriesByDate={calendarEntries}
            selectedId={selectedId}
            onSelectDate={selectDate}
            onSelectEntry={selectEntry}
          />

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
                  {dayEntries.length === 0 && <p className="text-sm text-muted-foreground">No classes for this selection.</p>}
                  {dayEntries.map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => selectEntry(entry)}
                      className={cn(
                        'block w-full rounded-md border-l-[3px] p-2 text-left text-sm hover:brightness-95 focus-visible:outline-2 focus-visible:outline-ring',
                        attendanceClassStyle(entry.session.classType ?? entry.session.title)
                      )}
                    >
                      <span className="block font-semibold">{entry.session.title}</span>
                      <span>{formatTime(entry.session.startTime)} · {statusText(entry)}</span>
                    </button>
                  ))}
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {upcoming.length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attended</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {past.filter(e => e.status === 'attended' || e.status === 'late').length}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Waitlisted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {waiting.length}
            </p>
          </CardContent>
        </Card>
      </div>

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
              Check the timetable for an available spot.
            </p>
          </CardContent>
        </Card>
      )}

      {!desktop && (
        <Drawer open={Boolean(selectedEntry) && !pending && !rescheduleId} onOpenChange={open => {
          if (!open) setSelectedId(null)
        }}>
          <DrawerContent>
            <DrawerHeader>
              <div>
                <DrawerTitle className="font-semibold">Class details</DrawerTitle>
                <DrawerDescription className="text-sm text-muted-foreground">{selectedEntry && prettyDate(selectedEntry.session.date)}</DrawerDescription>
              </div>
              <DrawerClose render={<Button variant="ghost" size="icon" aria-label="Close class details" />}>
                <X aria-hidden="true" />
              </DrawerClose>
            </DrawerHeader>
            <DrawerBody className="pt-0">{selectedEntry && rows([selectedEntry])}</DrawerBody>
          </DrawerContent>
        </Drawer>
      )}

      <Dialog open={Boolean(rescheduleId) && !pending} onOpenChange={open => {
        if (!open) setRescheduleId(null)
      }}>
        <DialogContent className="sm:max-w-lg" showCloseButton={false}>
          <DialogTitle>Choose a replacement class</DialogTitle>
          <DialogDescription>Your current booking stays until you confirm the replacement.</DialogDescription>

          <label className="block space-y-2 text-sm">
            <span>Available sessions</span>

            <select
              value={replacementId}
              onChange={e => setReplacementId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background p-3"
            >
              <option value="">
                Select a class
              </option>

              {alternatives.map(c => (
                <option key={c.id} value={c.id}>
                  {prettyDate(c.date)} · {c.title} ·{' '}
                  {formatTime(c.startTime)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRescheduleId(null)}
            >
              Back
            </Button>

            <Button
              disabled={!replacementId}
              onClick={() => {
                const replacement = classes.find(
                  c => c.id === replacementId
                )

                if (rescheduleId && replacement) {
                  setPending({
                    kind: 'reschedule',
                    id: rescheduleId,
                    replacement
                  })
                }
              }}
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pending)} onOpenChange={open => {
        if (!open) setPending(null)
      }}>
        {pending && (
          <DialogContent className="sm:max-w-md" showCloseButton={false}>
            <DialogTitle>
              {pending.kind === 'cancel'
                ? 'Cancel this class?'
                : pending.kind === 'leave'
                  ? 'Leave this waitlist?'
                  : 'Confirm rescheduling?'}
            </DialogTitle>

            <DialogDescription>
              {pending.kind === 'cancel'
                ? 'Are you sure you want to cancel this enrolment?'
                : pending.kind === 'leave'
                  ? 'Are you sure you want to remove your name from the waitlist?'
                  : pending.kind === 'reschedule'
                    ? `Your original class will be replaced with ${pending.replacement.title} on ${prettyDate(pending.replacement.date)}.`
                    : ''}
            </DialogDescription>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPending(null)}
              >
                No, go back
              </Button>

              <Button onClick={confirm} disabled={schedule.saving}>
                {pending.kind === 'cancel'
                  ? 'Yes, cancel class'
                  : pending.kind === 'leave'
                    ? 'Yes, leave waitlist'
                    : 'Yes, reschedule'}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>


    </div>
  )
}
