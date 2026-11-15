import type { ReactNode } from 'react'
import { CardListSkeleton } from '@/components/shared/skeletons'
import { useFeedback } from '@/hooks/use-feedback'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router'
import {
  CalendarDays,
  CalendarX,
  Coins,
  MapPin,
} from 'lucide-react'
import BackLink from '@/components/shared/layout/BackLink'
import EmptyState from '@/components/shared/layout/EmptyState'
import PageHeader from '@/components/shared/layout/PageHeader'
import RetryAlert from '@/components/shared/layout/RetryAlert'
import { StatusBadge } from '@/components/shared/status/StatusBadge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { StudentContext } from '@/layouts/StudentLayout'
import { supabase } from '@/lib/supabase'
import { dateKey } from '@/lib/instructor-calendar'
import { cn } from '@/lib/utils'
import {
  conflict,
  dateTime,
  formatTime,
  prettyDate
} from '@/lib/student-schedule'
import type {
  ClassOffering
} from '@/lib/student-schedule'
import FilterPopover, { FilterField } from '@/components/shared/filters/FilterPopover'
import { GradeLabelBadge } from '@/components/shared/grade/GradeBadge'

type Action =
  | { kind: 'enroll'; sessions: ClassOffering[] }
  | { kind: 'waitlist' | 'leave'; session: ClassOffering }

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

const seatColours = {
  full: 'bg-rose-50 text-rose-950 dark:bg-rose-950/45 dark:text-rose-100',
  low: 'bg-amber-50 text-amber-950 dark:bg-amber-950/45 dark:text-amber-100',
  normal: 'bg-background text-foreground'
}

function sessionAvailability(session: ClassOffering) {
  if (!session.bookable) return { tone: 'normal', label: 'Booking unavailable' } as const

  const spaces = session.capacity - session.occupied
  if (spaces <= 0) return { tone: 'full', label: 'Full · waitlist' } as const
  if (spaces <= 5) return { tone: 'low', label: `${spaces} ${spaces === 1 ? 'spot' : 'spots'} left` } as const
  return { tone: 'normal', label: '' } as const
}

function sessionTime(session: ClassOffering) {
  return `${formatTime(session.startTime)} – ${formatTime(session.endTime)}`
}

function ClassSessionPicker({
  sessions, date, selectedIds, conflictingIds, schedule, busy, onDateChange, onToggle, onWaitlist
}: {
  sessions: ClassOffering[]
  date: Date
  selectedIds: string[]
  conflictingIds: ReadonlySet<string>
  schedule: StudentContext['schedule']
  busy: boolean
  onDateChange: (date: Date) => void
  onToggle: (session: ClassOffering) => void
  onWaitlist: (session: ClassOffering, kind: 'waitlist' | 'leave') => void
}) {
  const sessionsByDay = new Map<string, ClassOffering[]>()
  for (const session of sessions) {
    const key = dateKey(session.date)
    const entries = sessionsByDay.get(key) ?? []
    entries.push(session)
    sessionsByDay.set(key, entries)
  }
  const daySessions = sessionsByDay.get(dateKey(date)) ?? []

  return (
    <div className="grid min-w-0 gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
      <div className="rounded-lg border p-3">
        <Calendar
          aria-label="Class dates"
          mode="single"
          required
          selected={date}
          defaultMonth={date}
          startMonth={sessions[0]?.date}
          endMonth={sessions.at(-1)?.date}
          showOutsideDays={false}
          className="mx-auto [--booking-day:clamp(1.75rem,9vw,2.75rem)] lg:[--booking-day:3rem] [&_.rdp-weekday]:w-(--booking-day) [&_.rdp-day]:size-(--booking-day) [&_.rdp-day_button]:size-(--booking-day) [&_.rdp-day_button]:text-base [&_.rdp-caption_label]:text-base [&_.rdp-caption_label]:font-semibold"
          disabled={day => busy || !sessionsByDay.has(dateKey(day))}
          onSelect={onDateChange}
        />
      </div>
      <div className="min-w-0 space-y-3">
        <h2 className="font-semibold" aria-live="polite">{prettyDate(date)}</h2>
        <div role="group" aria-label="Session times" className="grid max-h-80 gap-2 overflow-y-auto p-1">
          {daySessions.map(session => {
            const { tone, label } = sessionAvailability(session)
            const selected = selectedIds.includes(session.id)
            const booked = schedule.isBooked(session.id)
            const full = schedule.isFull(session)
            const waiting = schedule.isWaitlisted(session.id)
            const canLeave = waiting && full && session.bookable && !booked
            const overlapsBooking = !full && conflictingIds.has(session.id)
            const disabled = busy || booked || overlapsBooking || !session.bookable || (!schedule.active && !canLeave)
            return (
              <Button
                key={session.id}
                variant="outline"
                aria-pressed={full || booked || overlapsBooking || !session.bookable ? undefined : selected}
                disabled={disabled}
                className={cn(
                  'h-auto min-h-11 w-full flex-wrap justify-between gap-2 py-2 text-left whitespace-normal',
                  seatColours[tone],
                  selected && 'border-primary ring-1 ring-primary'
                )}
                onClick={() => {
                  if (full) onWaitlist(session, waiting ? 'leave' : 'waitlist')
                  else onToggle(session)
                }}
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{sessionTime(session)}</span>
                  <span className="block text-xs opacity-80">{session.centre} · {session.instructor}</span>
                </span>
                <span className="text-xs font-medium">
                  {booked ? 'Already enrolled' : overlapsBooking ? 'Overlaps a booking' : canLeave ? 'Leave waitlist' : label || `${session.capacity - session.occupied} spots left`}
                </span>
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function filterSessions(sessions: ClassOffering[], params: URLSearchParams) {
  const centre = params.get('centre')
  const day = params.get('day')
  const instructor = params.get('instructor')
  const period = params.get('period')
  return sessions.filter(session => {
    const hour = Number(session.startTime.slice(0, 2))
    return (!centre || session.centre === centre)
      && (!day || session.date.getDay() === Number(day))
      && (!instructor || session.instructor === instructor)
      && (!period || (period === 'morning' && hour < 12)
        || (period === 'afternoon' && hour >= 12 && hour < 17)
        || (period === 'evening' && hour >= 17))
  })
}

function SessionFilters({
  title, sessions, params, count, onChange, grade, disabled = false
}: {
  title: string
  sessions: ClassOffering[]
  params: URLSearchParams
  count: number
  onChange: (params: URLSearchParams) => void
  grade?: ReactNode
  disabled?: boolean
}) {
  const centre = params.get('centre') ?? 'all'
  const day = params.get('day') ?? 'all'
  const period = params.get('period') ?? 'all'
  const instructor = params.get('instructor') ?? 'all'
  const centres = [...new Set(sessions.map(session => session.centre))].sort()
  const instructors = [...new Set(sessions.map(session => session.instructor))].sort()

  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params)
    if (value === 'all') next.delete(name)
    else next.set(name, value)
    onChange(next)
  }

  const activeCount = [centre, day, period, instructor].filter(value => value !== 'all').length

  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {grade && <span className="flex items-center gap-1.5 text-xs text-muted-foreground">{grade}</span>}
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {count} upcoming {count === 1 ? 'session' : 'sessions'}
          </span>
          <FilterPopover
            title="Filter classes"
            activeCount={activeCount}
            onReset={() => {
              const next = new URLSearchParams(params)
              for (const key of ['centre', 'day', 'period', 'instructor']) next.delete(key)
              onChange(next)
            }}
          >
            <FilterField label="Dojo" value={centre} onChange={value => setFilter('centre', value)} disabled={disabled}
              ariaLabel="Dojo filter" options={[{ value: 'all', label: 'All dojos' }, ...centres.map(c => ({ value: c, label: c }))]} />
            <FilterField label="Day" value={String(day)} onChange={value => setFilter('day', value)} disabled={disabled}
              ariaLabel="Day filter" options={[{ value: 'all', label: 'Any day' }, ...days.map((d, i) => ({ value: String(i), label: d }))]} />
            <FilterField label="Time of day" value={period} onChange={value => setFilter('period', value)} disabled={disabled}
              ariaLabel="Time of day filter" options={[
                { value: 'all', label: 'Any time' },
                { value: 'morning', label: 'Morning' },
                { value: 'afternoon', label: 'Afternoon' },
                { value: 'evening', label: 'Evening' },
              ]} />
            <FilterField label="Instructor" value={instructor} onChange={value => setFilter('instructor', value)} disabled={disabled}
              ariaLabel="Instructor filter" options={[{ value: 'all', label: 'All instructors' }, ...instructors.map(i => ({ value: i, label: i }))]} />
          </FilterPopover>
        </div>
      </CardContent>
    </Card>
  )
}

function isRecommendedForGrade(type: string, grade: string | null | undefined) {
  if (!grade) return false
  if (type === 'Mixed/Family') return true

  const kyu = grade.match(/\b(\d+)(?:st|nd|rd|th)?\s+kyu\b/i)
  const isDan = /\b(?:\d+(?:st|nd|rd|th)?|junior)\s+dan\b/i.test(grade)
  const minimumKyu = type === 'Advanced' ? 1 : type === 'Intermediate' ? 4 : undefined

  // Age-restricted classes cannot be recommended from grade alone.
  return minimumKyu !== undefined && (isDan || (kyu !== null && Number(kyu[1]) <= minimumKyu))
}

export default function StudentClasses() {
  const { classes, schedule } = useOutletContext<StudentContext>()

  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
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
  const scheduledTypes = new Set(upcoming.map(session => session.classType ?? session.title))
  const unscheduled = catalog?.filter(type => !scheduledTypes.has(type.label))

  const matching = useMemo(() => filterSessions(upcoming, params), [upcoming, params])

  const groups = useMemo(() => {
    const grouped = new Map<string, ClassOffering[]>()

    for (const session of matching) {
      const type = session.classType ?? session.title
      const sessions = grouped.get(type) ?? []
      sessions.push(session)
      grouped.set(type, sessions)
    }

    const recommended = (type: string) => Number(isRecommendedForGrade(type, schedule.grade))
    return [...grouped].sort(([left], [right]) =>
      recommended(right) - recommended(left) || left.localeCompare(right)
    )
  }, [matching, schedule.grade])


  return (
    <div className="space-y-6">
      <PageHeader
        title="Classes"
        description="Pick a class type to see its dates and times."
        actions={(
          <Link to="/timetable" className={buttonVariants({ variant: 'outline' })}>
            <CalendarDays aria-hidden="true" className="size-4" />
            My schedule
          </Link>
        )}
      />

      <SessionFilters
        title="Find a class"
        sessions={upcoming}
        params={params}
        count={matching.length}
        grade={schedule.grade ? <>Current grade <GradeLabelBadge label={schedule.grade} /></> : 'Student membership'}
        onChange={next => setParams(next, { replace: true })}
      />

      <h2 className="text-lg font-semibold">Upcoming sessions</h2>
      {groups.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={upcoming.length ? 'No upcoming sessions match these filters' : 'No upcoming sessions are scheduled'}
          description={upcoming.length ? 'Try another dojo, day, time or instructor.' : undefined}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map(([type, sessions]) => {
            const bookingParams = new URLSearchParams(params)
            bookingParams.set('type', type)
            if (pathname === '/timetable') bookingParams.set('from', 'timetable')
            const next = sessions.reduce((first, session) => dateTime(session) < dateTime(first) ? session : first)
            const dojos = [...new Set(sessions.map(session => session.centre))].sort()
            return (
              <Card key={type} className="gap-4">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-lg">{type}</CardTitle>
                    {isRecommendedForGrade(type, schedule.grade) && (
                      <StatusBadge tone="info" dot={false}>Recommended for your grade</StatusBadge>
                    )}
                  </div>
                  {sessions[0]?.level && <p className="text-sm text-muted-foreground">{sessions[0].level}</p>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex items-start gap-1.5">
                      <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      <span>Next: {prettyDate(next.date)}, {sessionTime(next)} · {sessions.length} upcoming {sessions.length === 1 ? 'session' : 'sessions'}</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{dojos.join(', ')}</span>
                    </li>
                  </ul>
                  <Link
                    to={`/classes/choose?${bookingParams}`}
                    aria-label={`View sessions: ${type}`}
                    className={buttonVariants({ className: 'w-full' })}
                  >
                    View sessions
                  </Link>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {catalogError ? (
        <RetryAlert message="Could not load the full class list." onRetry={() => {
          setCatalogError(false)
          setCatalogRevision(revision => revision + 1)
        }} />
      ) : !catalog ? (
        <CardListSkeleton count={2} label="Loading the full class list…" />
      ) : unscheduled && unscheduled.length > 0 && (
        <section aria-labelledby="other-class-types" className="space-y-3">
          <h2 id="other-class-types" className="text-lg font-semibold">Other class types</h2>
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
    </div>
  )
}

export function StudentClassBooking() {
  const [params] = useSearchParams()
  const type = params.get('type') ?? ''
  const backParams = new URLSearchParams(params)
  backParams.delete('type')
  backParams.delete('from')
  const backPath = params.get('from') === 'timetable' ? '/timetable' : '/classes'
  const backTo = backParams.size ? `${backPath}?${backParams}` : backPath

  return (
    <div className="space-y-5">
      <BackLink to={backTo}>{backPath === '/timetable' ? 'Back to my schedule' : 'Back to classes'}</BackLink>
      <ClassBooking key={params.toString()} type={type} initialParams={backParams} />
    </div>
  )
}

function ClassBooking({ type, initialParams }: { type: string; initialParams: URLSearchParams }) {
  const { classes, schedule } = useOutletContext<StudentContext>()
  const { credits, creditAccount, creditError, refreshCredits } = useOutletContext<StudentContext>()
  const [params, setParams] = useState(initialParams)
  const [day, setDay] = useState('')
  const [pendingChange, setPendingChange] = useState<{ date: Date } | { params: URLSearchParams } | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [action, setAction] = useState<Action | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const { notify, feedbackDialog } = useFeedback()
  const [selectionError, setSelectionError] = useState('')
  const [actionError, setActionError] = useState('')

  const now = new Date()
  const classSessions = classes.filter(session =>
    (session.classType ?? session.title) === type && session.scheduled && dateTime(session) > now
  )
  const sessions = filterSessions(classSessions, params)
  const current = sessions.find(session => dateKey(session.date) === day)
    ?? sessions.find(session => session.bookable && !schedule.isFull(session))
    ?? sessions[0]

  const busy = submitting || schedule.saving
  const enrolmentCount = action?.kind === 'enroll' ? action.sessions.length : 0
  const insufficientCredits = Boolean(!creditAccount.loading && !creditError && !creditAccount.unlimited && creditAccount.credits < enrolmentCount)
  const bookings = classes.filter(session => session.scheduled && schedule.isBooked(session.id))
  const conflictingIds = new Set(sessions
    .filter(session => bookings.some(booking => booking.id !== session.id && conflict(session, booking)))
    .map(session => session.id))
  const selected = sessions.filter(session =>
    current && dateKey(session.date) === dateKey(current.date)
    && selectedIds.includes(session.id) && session.bookable
    && !schedule.isFull(session) && !schedule.isBooked(session.id) && !conflictingIds.has(session.id)
  )

  function applyDay(date: Date) {
    setDay(dateKey(date))
    setPendingChange(null)
    setSelectedIds([])
    setSelectionError('')
  }

  function changeDay(date: Date) {
    if (!current || dateKey(date) === dateKey(current.date)) return
    if (selected.length) setPendingChange({ date })
    else applyDay(date)
  }

  function changeFilters(next: URLSearchParams) {
    const nextSessions = filterSessions(selected, next)
    if (nextSessions.length !== selected.length) {
      setPendingChange({ params: next })
      return
    }
    setParams(next)
    setSelectionError('')
  }

  function confirmChange() {
    if (!pendingChange) return
    if ('date' in pendingChange) {
      applyDay(pendingChange.date)
    } else {
      setParams(pendingChange.params)
      setSelectedIds([])
      setPendingChange(null)
      setSelectionError('')
    }
  }

  function toggleSession(session: ClassOffering) {
    setSelectionError('')
    if (selectedIds.includes(session.id)) {
      setSelectedIds(ids => ids.filter(id => id !== session.id))
      return
    }

    if (conflictingIds.has(session.id)) {
      setSelectionError('This time overlaps a class you already booked.')
      return
    }

    if (selected.some(other => conflict(session, other))) {
      setSelectionError('These classes overlap. Choose times that do not overlap.')
      return
    }

    setDay(dateKey(session.date))
    setSelectedIds(ids => [...ids, session.id])
  }

  function closeAction() {
    setAction(null)
    setActionError('')
  }

  async function confirm() {
    if (!action || busy) return
    setSubmitting(true)
    setActionError('')
    try {
      if (action.kind === 'enroll') {
        if (!creditAccount.loading && !creditError && !creditAccount.unlimited && credits < action.sessions.length) {
          setActionError('Top up your credits before enrolling in these classes.')
          return
        }
        const completed: string[] = []
        const failed: ClassOffering[] = []
        const errors: string[] = []
        for (const session of action.sessions) {
          const error = await schedule.enroll(session)
          if (error) {
            failed.push(session)
            errors.push(`${sessionTime(session)} at ${session.centre}: ${error}`)
          } else {
            // The booking RPC already charged the earliest-expiring batch.
            completed.push(session.id)
          }
        }
        await refreshCredits()
        setSelectedIds(ids => ids.filter(id => !completed.includes(id)))
        if (completed.length) {
          const count = completed.length
          notify({ title: 'Enrolment confirmed', description: `Enrolled in ${count} ${count === 1 ? 'class' : 'classes'} on ${prettyDate(action.sessions[0].date)}.` })
        }
        if (failed.length) {
          setAction({ kind: 'enroll', sessions: failed })
          setActionError([
            ...(completed.length ? [`${completed.length} ${completed.length === 1 ? 'class was' : 'classes were'} booked.`] : []),
            ...errors
          ].join('\n'))
          return
        }
      } else {
        const error = action.kind === 'waitlist'
          ? await schedule.joinWaitlist(action.session)
          : await schedule.leaveWaitlist(action.session.id)
        if (error) {
          setActionError(error)
          return
        }
        notify(action.kind === 'waitlist' ? { title: 'Joined waitlist', description: 'You joined the waitlist. This does not reserve a spot.' } : { title: 'Left waitlist', description: 'You have left the waitlist.' })
      }
      closeAction()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="booking-class-title">
      <div id="booking-class-title">
        <PageHeader title={type || 'Choose a class'} description={classSessions[0]?.level || undefined} />
      </div>
      <SessionFilters
        title="Filter sessions"
        sessions={classSessions}
        params={params}
        count={sessions.length}
        disabled={busy}
        onChange={changeFilters}
      />
      {current ? <Card>
        <CardHeader>
          <CardTitle>Choose date and times</CardTitle>
          <p className="text-sm text-muted-foreground">
            Select one or more times, then enrol. You’ll be asked before a date change clears your selection.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ClassSessionPicker
            key={params.toString()}
            sessions={sessions}
            date={current.date}
            selectedIds={selected.map(session => session.id)}
            conflictingIds={conflictingIds}
            schedule={schedule}
            busy={busy}
            onDateChange={changeDay}
            onToggle={toggleSession}
            onWaitlist={(session, kind) => {
                        setAction({ kind, session })
            }}
          />
          {selectionError && <p role="alert" className="text-sm text-destructive">{selectionError}</p>}
          {!schedule.active && (
            <p className="text-sm text-muted-foreground">
              {schedule.linked ? 'Booking access requires an active membership.' : 'Link a student record to this account before booking.'}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Link to="/student/credits" className="text-sm text-primary underline">{creditError ? 'Credit balance unavailable' : creditAccount.loading ? 'Loading credits…' : creditAccount.unlimited ? 'Unlimited pass' : creditAccount.credits + ' credits available'}</Link>
            <p role="status" className="text-sm text-muted-foreground">
              {selected.length} {selected.length === 1 ? 'class' : 'classes'} selected
            </p>
            <Button
              disabled={!selected.length || !schedule.active || busy}
              onClick={() => setAction({ kind: 'enroll', sessions: selected })}
            >
              Enrol in selected classes
            </Button>
          </div>
        </CardContent>
      </Card> : (
        <EmptyState
          icon={CalendarX}
          title={classSessions.length ? 'No sessions match these filters' : 'No upcoming sessions for this class'}
        />
      )}

      {/* Phones: keep the action in reach while the times list scrolls. Leaves room for the help button. */}
      {selected.length > 0 && schedule.active && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t bg-background/95 px-4 pt-3 pr-20 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
          <Button size="touch" disabled={busy} onClick={() => setAction({ kind: 'enroll', sessions: selected })}>
            Enrol in {selected.length} {selected.length === 1 ? 'class' : 'classes'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={pendingChange !== null}
        onOpenChange={open => { if (!open) setPendingChange(null) }}
        title={pendingChange && 'params' in pendingChange ? 'Change filters?' : 'Change date?'}
        description="Your selected slots will be cleared. Confirm to continue."
        cancelLabel="Keep selection"
        confirmLabel={pendingChange && 'params' in pendingChange ? 'Apply filters' : 'Change date'}
        onConfirm={confirmChange}
      />

      <AlertDialog open={action !== null} onOpenChange={open => {
        if (!open && !busy) closeAction()
      }}>
        {action && (
          <AlertDialogContent size="compact">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {action.kind === 'enroll' ? 'Confirm enrolment?' : action.kind === 'waitlist' ? 'Join the waitlist?' : 'Leave the waitlist?'}
              </AlertDialogTitle>
              {action.kind === 'enroll' ? (
                <>
                  <AlertDialogDescription>{type} · {prettyDate(action.sessions[0].date)}</AlertDialogDescription>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-left text-sm">
                    {action.sessions.map(session => (
                      <li key={session.id}>{sessionTime(session)} · {session.centre}</li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
                    <span>Enrolment fee</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                      <Coins aria-hidden="true" className="size-4" />
                      {creditAccount.unlimited ? 'Included in your pass' : enrolmentCount + (enrolmentCount === 1 ? ' credit' : ' credits')}
                    </span>
                  </div>
                  {insufficientCredits && (
                    <p className="text-sm text-destructive">
                      {creditAccount.credits} credits available.{' '}
                      <Link to="/student/credits" className="font-medium underline">Top up credits</Link>
                    </p>
                  )}
                </>
              ) : (
                <AlertDialogDescription>
                  {action.session.title} · {prettyDate(action.session.date)} · {sessionTime(action.session)} · {action.session.centre}
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>
            {action.kind === 'waitlist' && (
              <p className="text-sm text-muted-foreground">Joining the waitlist does not reserve a spot.</p>
            )}
            {actionError && <p role="alert" className="whitespace-pre-line rounded-md bg-destructive/10 p-3 text-sm text-destructive">{actionError}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy} onClick={closeAction}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirm} disabled={busy || (action.kind === 'enroll' && insufficientCredits)}>
                {busy ? 'Saving…' : action.kind === 'enroll'
                  ? 'Enrol'
                  : action.kind === 'waitlist'
                    ? 'Join waitlist'
                    : 'Leave waitlist'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
      {feedbackDialog}
    </section>
  )
}
