import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, MapPin } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import AttendanceCalendar from '@/components/admin/AttendanceCalendar'
import { NativeSelect } from '@/components/admin/form-controls'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import {
  addDays,
  buildCalendarEvent,
  dateKey,
  parseIsoDate,
  weekDates,
} from '@/lib/admin/attendance-calendar'
import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'
import {
  formatDate,
  formatWeekday,
  fullName,
  relativeDay,
  startOfDay,
  toIsoDate,
} from '@/lib/admin/format'
import type { Session, SessionType } from '@/lib/admin/types'

const sessionTypeLabels: Record<SessionType, string> = {
  regular: 'Regular class',
  weapons: 'Weapons class',
  kids: 'Kids class',
  seminar: 'Seminar',
  external: 'External session',
}

function classOptionLabel(
  session: Session,
  instructors: { id: string; firstName: string; lastName: string }[],
) {
  const instructor = instructors.find((item) => item.id === session.instructorId)
  const parts = [
    session.title,
    sessionTypeLabels[session.type],
    instructor ? `${instructor.firstName} ${instructor.lastName}` : 'Unassigned',
  ]
  if (session.isExternal && session.type !== 'external') parts.push('External')
  return parts.join(' · ')
}

function latestFirst(left: Session, right: Session) {
  return `${right.date}T${right.startTime}`.localeCompare(
    `${left.date}T${left.startTime}`,
  )
}

function earliestFirst(left: Session, right: Session) {
  return (
    left.startTime.localeCompare(right.startTime) ||
    left.title.localeCompare(right.title)
  )
}

export default function AttendanceRegister() {
  const { centres, instructors, students, sessions, attendance } = useAdminData()
  const { centreId: filterCentreId, setCentreId } = useAdminFilters()
  const [searchParams, setSearchParams] = useSearchParams()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [today] = useState(() => startOfDay())

  const todayKey = toIsoDate(today)
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

  const fallbackSession = useMemo(() => {
    if (requestedSession || requestedDate) return undefined
    const latest = (items: Session[]) =>
      [...items].sort(latestFirst)[0] as Session | undefined

    if (focusStudent && !centreParam) {
      const recordedSessions = new Set(
        attendance
          .filter((record) => record.studentId === focusStudent.id)
          .map((record) => record.sessionId),
      )
      const centreSessions = sessions.filter(
        (session) =>
          session.centreId === focusStudent.homeCentreId &&
          session.date <= todayKey,
      )
      return (
        latest(
          centreSessions.filter((session) => recordedSessions.has(session.id)),
        ) ?? latest(centreSessions)
      )
    }

    const scopedCentreId =
      centreParam ?? (filterCentreId !== 'all' ? filterCentreId : undefined)
    if (scopedCentreId) {
      const scoped = sessions.filter(
        (session) => session.centreId === scopedCentreId,
      )
      return (
        latest(scoped.filter((session) => session.date <= todayKey)) ??
        latest(scoped)
      )
    }

    return (
      latest(sessions.filter((session) => session.date <= todayKey)) ??
      latest(sessions)
    )
  }, [
    requestedSession,
    requestedDate,
    focusStudent,
    centreParam,
    filterCentreId,
    sessions,
    attendance,
    todayKey,
  ])

  const selectedSession = requestedSession ?? fallbackSession
  const selectedDate = useMemo(() => {
    if (selectedSession) return parseIsoDate(selectedSession.date) ?? today
    return requestedDate ?? today
  }, [selectedSession, requestedDate, today])

  const centreOptions = useMemo(
    () =>
      centres.filter((centre) =>
        sessions.some((session) => session.centreId === centre.id),
      ),
    [centres, sessions],
  )

  const candidateCentreId =
    selectedSession?.centreId ??
    centreParam ??
    (filterCentreId !== 'all' ? filterCentreId : undefined) ??
    centres[0]?.id ??
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

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const session of centreSessions) {
      const list = map.get(session.date) ?? []
      list.push(session)
      map.set(session.date, list)
    }
    for (const list of map.values()) list.sort(earliestFirst)
    return map
  }, [centreSessions])

  const sessionDates = useMemo(
    () => Array.from(sessionsByDate.keys()).sort(),
    [sessionsByDate],
  )
  const earliestDate = parseIsoDate(sessionDates[0])
  const latestDate = parseIsoDate(sessionDates[sessionDates.length - 1])

  const selectedDaySessions = sessionsByDate.get(dateKey(selectedDate)) ?? []

  const timeOptions = useMemo(
    () =>
      Array.from(
        new Set(selectedDaySessions.map((session) => session.startTime)),
      ).sort(),
    [selectedDaySessions],
  )

  const activeTime = selectedSession?.startTime ?? timeOptions[0] ?? ''
  const classOptions = selectedDaySessions.filter(
    (session) => session.startTime === activeTime,
  )
  const classValue = selectedSession?.id ?? ''

  const calendarEvents = useMemo(() => {
    const keys = new Set(weekDates(selectedDate).map(dateKey))
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
    centreSessions,
    selectedDate,
    centres,
    instructors,
    students,
    attendance,
  ])

  function updateSelection({
    centreId = selectedCentreId,
    date = selectedDate,
    sessionId,
  }: {
    centreId?: string
    date?: Date
    sessionId: string | null
  }) {
    const next = new URLSearchParams(searchParams)
    next.delete('student')
    if (centreId) next.set('centre', centreId)
    else next.delete('centre')
    next.set('date', dateKey(date))
    if (sessionId) next.set('session', sessionId)
    else next.delete('session')
    setSearchParams(next)
  }

  function firstSessionOn(date: Date, centreId: string) {
    return sessions
      .filter(
        (session) =>
          session.centreId === centreId && session.date === dateKey(date),
      )
      .sort(earliestFirst)[0]
  }

  function latestSessionForCentre(centreId: string) {
    const scoped = sessions
      .filter((session) => session.centreId === centreId)
      .sort(latestFirst)
    return scoped.find((session) => session.date <= todayKey) ?? scoped[0]
  }

  function handleDateChange(date: Date) {
    const next = firstSessionOn(date, selectedCentreId)
    updateSelection({ date, sessionId: next?.id ?? null })
  }

  function handleCentreChange(nextCentreId: string) {
    const latest = latestSessionForCentre(nextCentreId)
    const nextDate = latest ? (parseIsoDate(latest.date) ?? today) : today
    updateSelection({
      centreId: nextCentreId,
      date: nextDate,
      sessionId: latest?.id ?? null,
    })
    if (nextCentreId !== filterCentreId) setCentreId(nextCentreId)
  }

  function handleTimeChange(startTime: string) {
    const next = selectedDaySessions.find(
      (session) => session.startTime === startTime,
    )
    if (next) updateSelection({ date: selectedDate, sessionId: next.id })
  }

  function handleClassChange(sessionId: string) {
    const session = sessions.find((item) => item.id === sessionId)
    if (!session) return
    updateSelection({
      centreId: session.centreId,
      date: parseIsoDate(session.date) ?? selectedDate,
      sessionId: session.id,
    })
  }

  function selectDay(date: Date) {
    if (dateKey(date) === dateKey(selectedDate)) return
    handleDateChange(date)
  }

  function toggleSession(event: AdminCalendarEvent) {
    if (selectedSession?.id === event.id) {
      updateSelection({ date: event.date, sessionId: null })
      return
    }
    updateSelection({
      centreId: event.session.centreId,
      date: event.date,
      sessionId: event.id,
    })
  }

  function clearStudentFocus() {
    const next = new URLSearchParams(searchParams)
    next.delete('student')
    setSearchParams(next)
  }

  if (!sessions.length || !selectedCentreId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No sessions found. Create a session before recording attendance.
          </p>
          <Button
            variant="outline"
            render={<Link to="/admin/attendance/sessions" />}
          >
            Go to sessions
          </Button>
        </CardContent>
      </Card>
    )
  }

  const selectedCentre = centres.find(
    (centre) => centre.id === selectedCentreId,
  )
  const selectedIso = dateKey(selectedDate)
  const relative = relativeDay(selectedIso)
  const dateLabel =
    relative === 'Today' || relative === 'Yesterday' || relative === 'Tomorrow'
      ? `${relative} · ${formatWeekday(selectedIso)}`
      : formatDate(selectedIso)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
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

      <Card className="shrink-0 gap-3">
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PickerField
              id="attendance-centre"
              label="Centre"
              value={selectedCentreId}
              onChange={handleCentreChange}
            >
              {centreOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </PickerField>

            <div className="space-y-1.5">
              <label
                className="text-xs text-muted-foreground"
                htmlFor="attendance-date"
              >
                Date
              </label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger
                  id="attendance-date"
                  type="button"
                  className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted dark:bg-input/30"
                >
                  <span className="truncate">{dateLabel}</span>
                  <CalendarDays
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-1.5">
                  <Calendar
                    mode="single"
                    required
                    selected={selectedDate}
                    defaultMonth={selectedDate}
                    startMonth={earliestDate ?? undefined}
                    endMonth={latestDate ?? undefined}
                    weekStartsOn={1}
                    onSelect={(date) => {
                      if (!date) return
                      handleDateChange(date)
                      setCalendarOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <PickerField
              id="attendance-time"
              label="Time"
              value={activeTime}
              onChange={handleTimeChange}
            >
              {timeOptions.length === 0 ? (
                <option value="">No classes</option>
              ) : (
                timeOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))
              )}
            </PickerField>

            <PickerField
              id="attendance-class"
              label="Class"
              value={classValue}
              onChange={handleClassChange}
            >
              {classOptions.length === 0 ? (
                <option value="">No classes</option>
              ) : (
                <>
                  {!selectedSession && (
                    <option value="" disabled>
                      Select a class
                    </option>
                  )}
                  {classOptions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {classOptionLabel(session, instructors)}
                    </option>
                  ))}
                </>
              )}
            </PickerField>
          </div>

          {selectedSession?.isExternal && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
              <MapPin
                className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">External session</p>
                <p className="text-muted-foreground">
                  {selectedSession.externalLocation ||
                    'External location not specified'}{' '}
                  · {selectedCentre?.name}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AttendanceCalendar
        date={selectedDate}
        today={today}
        events={calendarEvents}
        expandedSessionId={selectedSession?.id ?? null}
        focusStudentId={focusStudent?.id}
        onSelectDate={selectDay}
        onToggleSession={toggleSession}
        onToday={() => handleDateChange(today)}
        onNavigateWeek={(direction) =>
          handleDateChange(addDays(selectedDate, direction * 7))
        }
      />

      <p className="shrink-0 text-xs text-muted-foreground">
        Attendance rate uses present and late as attended; excused absences are
        excluded.
      </p>
    </div>
  )
}

function PickerField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      <NativeSelect
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </NativeSelect>
    </div>
  )
}
