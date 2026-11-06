import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  MapPin
} from 'lucide-react'
import { Button } from '@/components/student/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { StudentContext } from '@/layouts/StudentLayout'
import {
  addDays,
  dateTime,
  formatTime,
  isEligible,
  prettyDate
} from '@/lib/student-schedule'
import type {
  ClassOffering,
  Enrollment
} from '@/lib/student-schedule'

type Entry = Enrollment & {
  session: ClassOffering
}

type Pending =
  | { kind: 'cancel'; id: string }
  | { kind: 'leave'; id: string }
  | {
      kind: 'reschedule'
      id: string
      replacement: ClassOffering
    }

const dateId = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const startOfMonth = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), 1)

const statusText = (e: Entry) =>
  e.status === 'attended'
    ? 'Attended'
    : e.status === 'missed'
      ? 'Absent'
      : dateTime(e.session).getTime() <= Date.now()
        ? 'Past · not marked'
        : e.status === 'make-up'
          ? 'Make-up class'
          : 'Enrolled'

export default function StudentAttendance() {
  const { classes, schedule } = useOutletContext<StudentContext>()

  const [month, setMonth] = useState(
    () => startOfMonth(new Date())
  )
  const [selectedDay, setSelectedDay] = useState(
    () => dateId(new Date())
  )
  const [view, setView] = useState<'calendar' | 'list'>(
    'calendar'
  )
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
      e.status === 'attended' ||
      e.status === 'missed'
  )

  const waiting = classes.filter(
    c => schedule.waitlist.includes(c.id)
  )

  const calendarEntries = useMemo(() => {
    const map = new Map<string, Entry[]>()

    entries.forEach(e => {
      const list = map.get(e.session.dateId) ?? []
      list.push(e)
      map.set(e.session.dateId, list)
    })

    return map
  }, [entries])

  const monthFirst = startOfMonth(month)
  const gridStart = addDays(
    monthFirst,
    -monthFirst.getDay()
  )
  const numberOfDays = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate()

  const gridDays = Array.from(
    {
      length:
        Math.ceil(
          (monthFirst.getDay() + numberOfDays) / 7
        ) * 7
    },
    (_, i) => addDays(gridStart, i)
  )

  const dayEntries = calendarEntries.get(selectedDay) ?? []
  const selectedDate = new Date(`${selectedDay}T12:00:00`)

  const alternatives = classes
    .filter(
      c =>
        c.id !== rescheduleId &&
        dateTime(c).getTime() > Date.now() &&
        isEligible(c, schedule.belt) &&
        !schedule.check(c, rescheduleId ?? undefined)
    )
    .slice(0, 50)

  function changeMonth(offset: number) {
    const d = new Date(
      month.getFullYear(),
      month.getMonth() + offset,
      1
    )

    setMonth(d)
    setSelectedDay(dateId(d))
  }

  function confirm() {
    if (!pending) return

    if (pending.kind === 'cancel') {
      schedule.cancel(pending.id)
      setMessage('Demo class booking cancelled.')
    } else if (pending.kind === 'leave') {
      schedule.leaveWaitlist(pending.id)
      setMessage('Removed from demo waitlist.')
    } else if (pending.kind === 'reschedule') {
      const error = schedule.reschedule(
        pending.id,
        pending.replacement
      )

      setMessage(
        error ??
        `Class moved to ${prettyDate(pending.replacement.date)}.`
      )

      if (!error) {
        setRescheduleId(null)
        setReplacementId('')
      }
    }

    setPending(null)
  }

  function rows(items: Entry[]) {
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
        <div key={e.id} className="border-b py-4 last:border-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">
                {e.session.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {prettyDate(e.session.date)}
              </p>
            </div>

            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
              {statusText(e)}
            </span>
          </div>

          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="size-4" />
            {formatTime(e.session.startTime)}
            {' – '}
            {formatTime(e.session.endTime)}
          </p>

          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4" />
            {e.session.centre}
          </p>

          {future && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
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
    <div className="relative left-1/2 w-[min(94vw,1450px)] -translate-x-1/2 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">
            Timetable
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a date to see your classes,
            just like a personal calendar.
          </p>
        </div>

        <Button
          variant="outline"
          render={<Link to="/classes" />}
        >
          Browse classes
        </Button>
      </div>

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
              {past.filter(e => e.status === 'attended').length}
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

      {message && (
        <p
          role="status"
          className="rounded-lg border bg-muted px-4 py-3 text-sm"
        >
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-muted p-1">
          <Button
            size="sm"
            variant={view === 'calendar' ? 'default' : 'ghost'}
            onClick={() => setView('calendar')}
          >
            <CalendarDays className="size-4" />
            Calendar
          </Button>

          <Button
            size="sm"
            variant={view === 'list' ? 'default' : 'ghost'}
            onClick={() => setView('list')}
          >
            <List className="size-4" />
            List
          </Button>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const d = new Date()
            setMonth(startOfMonth(d))
            setSelectedDay(dateId(d))
          }}
        >
          Today
        </Button>
      </div>

      {view === 'calendar' ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
          <Card className="gap-3">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-xl">
                  {month.toLocaleDateString('en-SG', {
                    month: 'long',
                    year: 'numeric'
                  })}
                </CardTitle>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Previous month"
                    onClick={() => changeMonth(-1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Next month"
                    onClick={() => changeMonth(1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
                {[
                  'Sun',
                  'Mon',
                  'Tue',
                  'Wed',
                  'Thu',
                  'Fri',
                  'Sat'
                ].map(d => (
                  <div key={d} className="pb-2">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
                {gridDays.map(d => {
                  const id = dateId(d)
                  const items = calendarEntries.get(id) ?? []
                  const selected = selectedDay === id
                  const isToday = id === dateId(new Date())

                  return (
                    <button
                      key={id}
                      type="button"
                      aria-label={`${prettyDate(d)}, ${items.length} classes`}
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedDay(id)

                        if (d.getMonth() !== month.getMonth()) {
                          setMonth(startOfMonth(d))
                        }
                      }}
                      className={`min-h-20 min-w-0 p-1.5 text-left align-top transition-colors sm:min-h-28 sm:p-2 ${
                        selected
                          ? 'bg-primary/10 ring-2 ring-inset ring-primary'
                          : 'bg-card hover:bg-muted'
                      } ${
                        d.getMonth() !== month.getMonth()
                          ? 'opacity-50'
                          : ''
                      }`}
                    >
                      <span
                        className={`inline-flex size-7 items-center justify-center rounded-full text-sm ${
                          isToday
                            ? 'bg-primary text-primary-foreground'
                            : ''
                        }`}
                      >
                        {d.getDate()}
                      </span>

                      <div className="mt-1 space-y-1">
                        {items.slice(0, 2).map(e => (
                          <div
                            key={e.id}
                            className="truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary"
                            title={e.session.title}
                          >
                            {e.session.startTime} {e.session.title}
                          </div>
                        ))}

                        {items.length > 2 && (
                          <p className="text-[10px] text-muted-foreground">
                            +{items.length - 2} more
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="gap-2">
            <CardHeader>
              <CardTitle>
                {prettyDate(selectedDate)}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {dayEntries.length} scheduled{' '}
                {dayEntries.length === 1 ? 'class' : 'classes'}
              </p>
            </CardHeader>

            <CardContent>{rows(dayEntries)}</CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming classes</CardTitle>
            </CardHeader>
            <CardContent>{rows(upcoming)}</CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Past attendance</CardTitle>
            </CardHeader>
            <CardContent>
              {rows(past)}
              <p className="mt-2 text-xs text-muted-foreground">
                Actual attendance must be recorded by an instructor.
              </p>
            </CardContent>
          </Card>
        </div>
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
              Administrator email notifications are not yet implemented.
            </p>
          </CardContent>
        </Card>
      )}

      {rescheduleId && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reschedule-title"
            className="w-full max-w-lg space-y-4 rounded-xl bg-background p-6 shadow-xl"
          >
            <h3
              id="reschedule-title"
              className="text-xl font-semibold"
            >
              Choose a replacement class
            </h3>

            <p className="text-sm text-muted-foreground">
              Your current booking stays until you confirm the replacement.
            </p>

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

                  if (replacement) {
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
          </div>
        </div>
      )}

      {pending && (
        <div
          role="presentation"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-action-title"
            className="w-full max-w-md space-y-4 rounded-xl bg-background p-6 shadow-xl"
          >
            <h3
              id="confirm-action-title"
              className="text-xl font-semibold"
            >
              {pending.kind === 'cancel'
                ? 'Cancel this class?'
                : pending.kind === 'leave'
                  ? 'Leave this waitlist?'
                  : 'Confirm rescheduling?'}
            </h3>

            <p className="text-sm text-muted-foreground">
            {pending.kind === 'cancel'
              ? 'Are you sure you want to cancel this enrolment?'
              : pending.kind === 'leave'
                ? 'Are you sure you want to remove your name from the waitlist?'
                : pending.kind === 'reschedule'
                  ? `Your original class will be replaced with ${pending.replacement.title} on ${prettyDate(pending.replacement.date)}.`
                  : ''}
            </p>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPending(null)}
              >
                No, go back
              </Button>

              <Button onClick={confirm}>
                {pending.kind === 'cancel'
                  ? 'Yes, cancel class'
                  : pending.kind === 'leave'
                    ? 'Yes, leave waitlist'
                    : 'Yes, reschedule'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        This is a local prototype. Enrolments, waitlists and
        schedule changes are stored in the browser, not shared
        with administrators. Attendance history requires an
        instructor-connected database.
      </p>
    </div>
  )
}