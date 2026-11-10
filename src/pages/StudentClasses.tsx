import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  MapPin,
  SlidersHorizontal,
  UsersRound
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/student/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { StudentContext } from '@/layouts/StudentLayout'
import { supabase } from '@/lib/supabase'
import {
  dateTime,
  formatTime,
  prettyDate
} from '@/lib/student-schedule'
import type {
  ClassOffering
} from '@/lib/student-schedule'

type Action = {
  kind: 'enroll' | 'waitlist' | 'leave'
  session: ClassOffering
}

type ClassType = { id: string; label: string; description: string }

const days = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
]

const input =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring'
const monthFormat = new Intl.DateTimeFormat('en-SG', { month: 'long', year: 'numeric' })

export default function StudentClasses() {
  const { classes, schedule } = useOutletContext<StudentContext>()

  const [centre, setCentre] = useState('all')
  const [day, setDay] = useState('all')
  const [period, setPeriod] = useState('all')
  const [instructor, setInstructor] = useState('all')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [action, setAction] = useState<Action | null>(null)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [catalog, setCatalog] = useState<ClassType[] | null>(null)
  const [catalogError, setCatalogError] = useState(false)
  const [catalogRevision, setCatalogRevision] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function loadCatalog() {
      try {
        const { data, error } = await supabase.from('class_types')
          .select('id, label, description')
          .order('label')
          .abortSignal(controller.signal)
        if (error) throw error
        if (!controller.signal.aborted) setCatalog(data)
      } catch {
        if (!controller.signal.aborted) setCatalogError(true)
      }
    }
    void loadCatalog()
    return () => controller.abort()
  }, [catalogRevision])

  const upcoming = useMemo(() => {
    const now = new Date()
    return classes.filter(session => session.scheduled && dateTime(session) > now)
  }, [classes])
  const centres = [...new Set(upcoming.map(c => c.centre))]
  const instructors = [...new Set(upcoming.map(c => c.instructor))]
  const scheduledTypes = new Set(upcoming.map(session => session.classType ?? session.title))
  const unscheduled = catalog?.filter(type => !scheduledTypes.has(type.label))

  const matching = useMemo(
    () =>
      upcoming.filter(c => {
        const hour = Number(c.startTime.slice(0, 2))

        return (
          (centre === 'all' || c.centre === centre) &&
          (day === 'all' || c.date.getDay() === Number(day)) &&
          (instructor === 'all' || c.instructor === instructor) &&
          (
            period === 'all' ||
            (period === 'morning' && hour < 12) ||
            (period === 'afternoon' && hour >= 12 && hour < 17) ||
            (period === 'evening' && hour >= 17)
          )
        )
      }),
    [
      upcoming,
      centre,
      day,
      instructor,
      period
    ]
  )

  const groups = useMemo(() => {
    const grouped = new Map<string, ClassOffering[]>()

    for (const session of matching) {
      const type = session.classType ?? session.title
      const sessions = grouped.get(type) ?? []
      sessions.push(session)
      grouped.set(type, sessions)
    }

    return [...grouped].sort(([left], [right]) => left.localeCompare(right))
  }, [matching])

  function reset() {
    setCentre('all')
    setDay('all')
    setPeriod('all')
    setInstructor('all')
  }

  async function confirm() {
    if (!action || schedule.saving) return
    setActionError('')

    const { kind, session } = action

    const error =
      kind === 'enroll'
        ? await schedule.enroll(session)
        : kind === 'waitlist'
          ? await schedule.joinWaitlist(session)
          : await schedule.leaveWaitlist(session.id)

    if (error) {
      setActionError(error)
      return
    }

    setMessage(
      kind === 'enroll'
          ? `Enrolled in ${session.title} on ${prettyDate(session.date)}.`
          : kind === 'waitlist'
            ? 'You joined the waitlist. Check the timetable for an available spot.'
            : 'You have left the waitlist.'
    )

    setAction(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">
            Class timetable & enrolment
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse all class types and choose a session when one is scheduled.
          </p>
        </div>

        <Link to="/attendance" className={buttonVariants({ variant: 'outline' })}>
          <CalendarDays className="size-4" />
          My schedule
        </Link>
      </div>

      <Card className="gap-3">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Find a class</CardTitle>
            <span className="text-xs text-muted-foreground">
              {schedule.grade ? `Current grade: ${schedule.grade}` : 'Student membership'}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span>Centre</span>
              <select
                className={input}
                value={centre}
                onChange={e => setCentre(e.target.value)}
              >
                <option value="all">All centres</option>
                {centres.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span>Day</span>
              <select
                className={input}
                value={day}
                onChange={e => setDay(e.target.value)}
              >
                <option value="all">Any day</option>
                {days.map((d, i) => (
                  <option value={i} key={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

          </div>

          <button
            type="button"
            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            onClick={() => setShowAdvanced(v => !v)}
            aria-expanded={showAdvanced}
          >
            <SlidersHorizontal className="size-4" />
            More filters
            <ChevronDown
              className={`size-4 transition-transform ${
                showAdvanced ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showAdvanced && (
            <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="space-y-1 text-sm">
                <span>Time of day</span>
                <select
                  className={input}
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                >
                  <option value="all">Any time</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </label>

              <label className="space-y-1 text-sm">
                <span>Instructor</span>
                <select
                  className={input}
                  value={instructor}
                  onChange={e => setInstructor(e.target.value)}
                >
                  <option value="all">All instructors</option>
                  {instructors.map(i => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </label>

            </div>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">
              {matching.length} upcoming {matching.length === 1 ? 'session' : 'sessions'}
            </span>
            <Button variant="ghost" size="sm" onClick={reset}>
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {message && (
        <div
          role="status"
          className="rounded-lg border bg-muted px-4 py-3 text-sm"
        >
          {message}
        </div>
      )}

      <h3 className="text-lg font-semibold">Upcoming sessions</h3>
      {!schedule.active && (
        <p className="rounded-lg border bg-muted px-4 py-3 text-sm">
          {schedule.linked
            ? 'Your membership is not active. You can browse classes while booking access is pending.'
            : 'Link a student record to this account before booking.'}
        </p>
      )}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {upcoming.length ? 'No upcoming sessions match these filters.' : 'No upcoming sessions are scheduled.'}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(([type, sessions]) => {
            const first = sessions[0]
            const current = sessions.find(session => session.id === selected[type])
              ?? sessions.find(session => session.bookable && !schedule.isFull(session))
              ?? first
            const months = new Map<string, ClassOffering[]>()
            for (const session of sessions) {
              const month = monthFormat.format(session.date)
              const entries = months.get(month) ?? []
              entries.push(session)
              months.set(month, entries)
            }

            const booked = schedule.isBooked(current.id)
            const waitlisted = schedule.isWaitlisted(current.id)
            const full = schedule.isFull(current)

            const available = Math.max(
              0,
              current.capacity - current.occupied
            )

            return (
              <Card key={type} className="gap-3">
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">
                      {type}
                    </CardTitle>
                  </div>

                  {first.level && <p className="text-xs text-muted-foreground">{first.level}</p>}
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                    <span className="flex items-center gap-2">
                      <MapPin className="size-4" />
                      {current.centre}
                    </span>

                    <span className="flex items-center gap-2">
                      <Clock3 className="size-4" />
                      {formatTime(current.startTime)}–
                      {formatTime(current.endTime)}
                    </span>

                    <span>{current.instructor}</span>

                    <span className="flex items-center gap-2">
                      <UsersRound className="size-4" />
                      {!current.bookable ? 'Online booking unavailable' : full
                        ? 'Fully booked'
                        : `${available} of ${current.capacity} slots left`}
                    </span>
                  </div>

                  <label className="block space-y-1 text-sm">
                    <span className="font-medium">
                      Choose date and time
                    </span>

                    <select
                      className={input}
                      aria-label={`Choose date and time for ${type}`}
                      value={current.id}
                      onChange={e =>
                        setSelected(prev => ({
                          ...prev,
                          [type]: e.target.value
                        }))
                      }
                    >
                      {[...months].map(([month, entries]) => (
                        <optgroup key={month} label={month}>
                          {entries.map(session => (
                            <option key={session.id} value={session.id}>
                              {prettyDate(session.date)} · {formatTime(session.startTime)} – {formatTime(session.endTime)} · {session.centre}
                              {schedule.isFull(session) && session.bookable ? ' · Full' : ''}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>


                  {booked ? (
                    <Button className="w-full" disabled>
                      Already enrolled
                    </Button>
                  ) : waitlisted && full ? (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() =>
                        setAction({
                          kind: 'leave',
                          session: current
                        })
                      }
                    >
                      Leave waitlist
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      disabled={!current.bookable || !schedule.active || schedule.saving}
                      onClick={() =>
                        setAction({
                          kind: full ? 'waitlist' : 'enroll',
                          session: current
                        })
                      }
                    >
                      {!current.bookable ? 'Booking unavailable' : full ? 'Join waitlist' : 'Enrol in this class'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {catalogError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <p>Could not load the full class list.</p>
          <Button variant="outline" size="sm" onClick={() => {
            setCatalogError(false)
            setCatalogRevision(revision => revision + 1)
          }}>Try again</Button>
        </div>
      ) : !catalog ? (
        <p role="status" className="text-sm text-muted-foreground">Loading the full class list…</p>
      ) : unscheduled && unscheduled.length > 0 && (
        <section aria-labelledby="other-class-types" className="space-y-3">
          <h3 id="other-class-types" className="text-lg font-semibold">Other class types</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {unscheduled.map(type => (
              <Card key={type.id} className="gap-2">
                <CardHeader>
                  <CardTitle className="text-lg">{type.label}</CardTitle>
                  {type.description && <p className="text-sm text-muted-foreground">{type.description}</p>}
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">No upcoming sessions</CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <Dialog open={action !== null} onOpenChange={open => {
        if (!open && !schedule.saving) {
          setAction(null)
          setActionError('')
        }
      }}>
        {action && (
          <DialogContent showCloseButton={false} className="sm:max-w-md">
            <DialogTitle>
              {action.kind === 'enroll'
                ? 'Confirm enrolment?'
                : action.kind === 'waitlist'
                  ? 'Join the waitlist?'
                  : 'Leave the waitlist?'}
            </DialogTitle>
            <DialogDescription>
              {action.session.title} · {prettyDate(action.session.date)} ·{' '}
              {formatTime(action.session.startTime)} – {formatTime(action.session.endTime)} · {action.session.centre}
            </DialogDescription>

            {action.kind === 'waitlist' && (
              <p className="text-sm text-muted-foreground">Joining the waitlist does not reserve a spot.</p>
            )}
            {actionError && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" disabled={schedule.saving} onClick={() => {
                setAction(null)
                setActionError('')
              }}>
                Back
              </Button>
              <Button onClick={confirm} disabled={schedule.saving}>
                {schedule.saving ? 'Saving…' : action.kind === 'enroll'
                  ? 'Yes, enrol'
                  : action.kind === 'waitlist'
                    ? 'Yes, join waitlist'
                    : 'Yes, leave waitlist'}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>

    </div>
  )
}
