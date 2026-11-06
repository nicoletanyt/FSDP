import { useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  MapPin,
  SlidersHorizontal,
  Sparkles,
  UsersRound
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
  beltRanks,
  dateTime,
  formatTime,
  isEligible,
  isRecommended,
  prettyDate
} from '@/lib/student-schedule'
import type {
  BeltRank,
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
  const [showAllLevels, setShowAllLevels] = useState(false)
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
          dateTime(c).getTime() > Date.now() &&
          (centre === 'all' || c.centre === centre) &&
          (day === 'all' || c.date.getDay() === Number(day)) &&
          (instructor === 'all' || c.instructor === instructor) &&
          (
            period === 'all' ||
            (period === 'morning' && hour < 12) ||
            (period === 'afternoon' && hour >= 12 && hour < 17) ||
            (period === 'evening' && hour >= 17)
          ) &&
          (showAllLevels || isEligible(c, schedule.belt))
        )
      }),
    [
      classes,
      centre,
      day,
      instructor,
      period,
      showAllLevels,
      schedule.belt
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
    setShowAllLevels(false)
  }

  function confirm() {
    if (!action) return

    const { kind, session } = action

    const error =
      kind === 'enroll'
        ? schedule.enroll(session)
        : kind === 'waitlist'
          ? schedule.joinWaitlist(session)
          : (schedule.leaveWaitlist(session.id), null)

    setMessage(
      error ??
      (
        kind === 'enroll'
          ? `Enrolled in ${session.title} on ${prettyDate(session.date)}.`
          : kind === 'waitlist'
            ? 'You joined the demo waitlist. Joining does not guarantee a class spot. An administrator would email you if a space becomes available and is allocated to you; email notifications are not yet connected.'
            : 'You have left the demo waitlist.'
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

        <Button
          variant="outline"
          render={<Link to="/attendance" />}
        >
          <CalendarDays className="size-4" />
          My schedule
        </Button>
      </div>

      <Card className="gap-3">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Find a class</CardTitle>
            <span className="text-xs text-muted-foreground">
              Demo belt: {schedule.belt}
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

            <label className="space-y-1 text-sm">
              <span>My belt level (demo)</span>
              <select
                className={input}
                value={schedule.belt}
                onChange={e =>
                  schedule.setBelt(e.target.value as BeltRank)
                }
              >
                {beltRanks.map(b => (
                  <option key={b}>{b}</option>
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

              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={showAllLevels}
                  onChange={e =>
                    setShowAllLevels(e.target.checked)
                  }
                />
                Show classes above my belt level
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
            const eligible = isEligible(current, schedule.belt)

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

                    {isRecommended(current, schedule.belt) && (
                      <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        <Sparkles className="size-3" />
                        Recommended
                      </span>
                    )}
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
                      {full
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
                          {schedule.isFull(c)
                            ? 'Full'
                            : `${Math.max(
                                0,
                                c.capacity - c.occupied
                              )} spaces`}
                        </option>
                      ))}
                    </select>
                  </label>

                  {!eligible && (
                    <p className="text-xs text-destructive">
                      This class requires a higher belt level.
                    </p>
                  )}

                  {booked ? (
                    <Button className="w-full" disabled>
                      Already enrolled
                    </Button>
                  ) : waitlisted ? (
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
                      disabled={!eligible}
                      onClick={() =>
                        setAction({
                          kind: full ? 'waitlist' : 'enroll',
                          session: current
                        })
                      }
                    >
                      {full
                        ? 'Join waitlist'
                        : 'Enrol in this class'}
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
              <p className="rounded-lg bg-muted p-3 text-sm">
                <strong>Important:</strong> Joining the waitlist
                does not guarantee a spot. If a slot opens and
                you are selected, an administrator will notify
                you by email.
                {' '}
                <strong>
                  This draft does not send actual emails or
                  notify administrators.
                </strong>
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setAction(null)}
              >
                Back
              </Button>

              <Button onClick={confirm}>
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

      <p className="text-xs text-muted-foreground">
        Prototype: class capacity, enrolments and waitlists use
        demo data/local browser storage. Waitlist allocation
        and administrator email alerts need backend integration.
      </p>
    </div>
  )
}
