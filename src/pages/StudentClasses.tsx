import { useMemo, useState } from 'react'
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
import type {
  ClassOffering
} from '@/lib/student-schedule'

type Action = {
  kind: 'enroll' | 'waitlist' | 'leave'
  session: ClassOffering
}

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

  const centres = [...new Set(classes.map(c => c.centre))]
  const instructors = [...new Set(classes.map(c => c.instructor))]

  const matching = useMemo(
    () =>
      classes.filter(c => {
        const hour = Number(c.startTime.slice(0, 2))

        return (
          c.scheduled && dateTime(c).getTime() > Date.now() &&
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
      classes,
      centre,
      day,
      instructor,
      period
    ]
  )

  const groups = useMemo(() => {
    const grouped = new Map<string, ClassOffering[]>()

    matching.forEach(c => {
      const values = grouped.get(c.templateId) ?? []
      values.push(c)
      grouped.set(c.templateId, values)
    })

    return [...grouped.values()]
  }, [matching])

  function reset() {
    setCentre('all')
    setDay('all')
    setPeriod('all')
    setInstructor('all')
  }

  async function confirm() {
    if (!action) return

    const { kind, session } = action

    const error =
      kind === 'enroll'
        ? await schedule.enroll(session)
        : kind === 'waitlist'
          ? await schedule.joinWaitlist(session)
          : await schedule.leaveWaitlist(session.id)

    setMessage(
      error ??
      (
        kind === 'enroll'
          ? `Enrolled in ${session.title} on ${prettyDate(session.date)}.`
          : kind === 'waitlist'
            ? 'You joined the waitlist. Check the timetable for an available spot.'
            : 'You have left the waitlist.'
      )
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
            Choose a class, then select a suitable session.
            No need to scroll through every date.
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
              {groups.length} class types found
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

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No matching classes. Try another day or reset the filters.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(sessions => {
            const first = sessions[0]
            const current =
              sessions.find(
                c => c.id === selected[first.templateId]
              ) ?? first

            const booked = schedule.isBooked(current.id)
            const waitlisted = schedule.isWaitlisted(current.id)
            const full = schedule.isFull(current)

            const available = Math.max(
              0,
              current.capacity -
                current.occupied -
                (booked ? 1 : 0)
            )

            return (
              <Card key={first.templateId} className="gap-3">
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">
                      {first.title}
                    </CardTitle>

                  </div>

                  <p className="text-xs text-muted-foreground">
                    {first.level}
                  </p>
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
                      Choose a session
                    </span>

                    <select
                      className={input}
                      value={current.id}
                      onChange={e =>
                        setSelected(prev => ({
                          ...prev,
                          [first.templateId]: e.target.value
                        }))
                      }
                    >
                      {sessions.slice(0, 12).map(c => (
                        <option key={c.id} value={c.id}>
                          {prettyDate(c.date)} ·{' '}
                          {!c.bookable ? 'Online booking unavailable' : schedule.isFull(c)
                            ? 'Full'
                            : `${Math.max(
                                0,
                                c.capacity - c.occupied
                              )} spaces`}
                        </option>
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

      {action && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onMouseDown={e => {
            if (e.target === e.currentTarget) {
              setAction(null)
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="class-confirm-title"
            className="w-full max-w-md space-y-4 rounded-xl bg-background p-6 shadow-xl"
          >
            <h3
              id="class-confirm-title"
              className="text-xl font-semibold"
            >
              {action.kind === 'enroll'
                ? 'Confirm enrolment?'
                : action.kind === 'waitlist'
                  ? 'Join the waitlist?'
                  : 'Leave the waitlist?'}
            </h3>

            <p className="text-sm">
              {action.session.title} —{' '}
              {prettyDate(action.session.date)} at{' '}
              {formatTime(action.session.startTime)}
            </p>

            {action.kind === 'waitlist' && (
              <p className="text-sm text-muted-foreground">Joining the waitlist does not reserve a spot.</p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setAction(null)}
              >
                Back
              </Button>

              <Button onClick={confirm} disabled={schedule.saving}>
                {action.kind === 'enroll'
                  ? 'Yes, enrol'
                  : action.kind === 'waitlist'
                    ? 'Yes, join waitlist'
                    : 'Yes, leave waitlist'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!schedule.active && (
        <p className="text-sm text-muted-foreground">An active student membership is required to book online.</p>
      )}
    </div>
  )
}
