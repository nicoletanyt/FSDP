import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, CheckCircle2, MapPin, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import { getRecentSessions, getSessionRoster } from '@/lib/admin/analytics'
import {
  formatDate,
  formatWeekday,
  fullName,
  initials,
  relativeDay,
  todayIso,
  toIsoDate,
} from '@/lib/admin/format'
import type { AttendanceStatus, Session, SessionType } from '@/lib/admin/types'
import { cn } from 'cn'
import { NativeSelect } from '@/components/admin/form-controls'
import { StatusBadge } from '@/components/admin/StatusBadge'

const statuses: { value: AttendanceStatus; label: string; active: string }[] = [
  { value: 'present', label: 'Present', active: 'bg-success text-success-foreground' },
  { value: 'late', label: 'Late', active: 'bg-warning text-warning-foreground' },
  { value: 'absent', label: 'Absent', active: 'bg-destructive text-destructive-foreground' },
  { value: 'excused', label: 'Excused', active: 'bg-muted-foreground text-background' },
]

const sessionTypeLabels: Record<SessionType, string> = {
  regular: 'Regular class',
  weapons: 'Weapons class',
  kids: 'Kids class',
  seminar: 'Seminar',
  external: 'External session',
}

function dateOptionLabel(date: string) {
  const weekday = formatWeekday(date)
  const relative = relativeDay(date)
  return relative === 'Today' || relative === 'Yesterday'
    ? `${relative} · ${weekday}`
    : weekday
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

export default function AttendanceRegister() {
  const { centres, instructors, students, sessions, attendance, saveAttendance } =
    useAdminData()
  const { centreId, setCentreId } = useAdminFilters()
  const [searchParams, setSearchParams] = useSearchParams()
  const studentParam = searchParams.get('student')
  const sessionParam = searchParams.get('session')

  const studentFocus = studentParam
    ? students.find((student) => student.id === studentParam)
    : undefined

  // Attendance is recorded after a class, so only past and today's sessions appear.
  const pastSessions = useMemo(
    () => getRecentSessions(sessions, 'all', Number.MAX_SAFE_INTEGER),
    [sessions],
  )

  const [selectedSessionId, setSelectedSessionId] = useState(() => {
    const preferred =
      pastSessions.find((session) => session.id === sessionParam) ??
      (centreId !== 'all'
        ? pastSessions.find((session) => session.centreId === centreId)
        : undefined) ??
      (studentFocus
        ? pastSessions.find(
            (session) => session.centreId === studentFocus.homeCentreId,
          )
        : undefined) ??
      pastSessions[0]
    return preferred?.id ?? ''
  })
  const [rosterSearch, setRosterSearch] = useState('')
  const [statusesById, setStatusesById] = useState<Record<string, AttendanceStatus>>({})
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const selectedSession = pastSessions.find(
    (session) => session.id === selectedSessionId,
  )

  // Follow the global centre filter when it changes, but leave the initial
  // deep link untouched on first render.
  const hasSyncedFilter = useRef(false)
  useEffect(() => {
    if (!hasSyncedFilter.current) {
      hasSyncedFilter.current = true
      return
    }
    if (centreId === 'all' || selectedSession?.centreId === centreId) return
    const next = pastSessions.find((session) => session.centreId === centreId)
    if (next) {
      chooseSession(next)
    }
  }, [centreId, pastSessions, selectedSession, searchParams])

  const centreSessions = useMemo(
    () =>
      selectedSession
        ? pastSessions.filter(
            (session) => session.centreId === selectedSession.centreId,
          )
        : [],
    [pastSessions, selectedSession],
  )

  const centreOptions = useMemo(
    () =>
      centres.filter((centre) =>
        pastSessions.some((session) => session.centreId === centre.id),
      ),
    [centres, pastSessions],
  )

  const dateOptions = useMemo(
    () =>
      Array.from(new Set(centreSessions.map((session) => session.date))).sort(
        (left, right) => right.localeCompare(left),
      ),
    [centreSessions],
  )

  const availableDates = useMemo(() => new Set(dateOptions), [dateOptions])
  const earliestDate = dateOptions[dateOptions.length - 1]

  const timeOptions = useMemo(() => {
    if (!selectedSession) return []
    return Array.from(
      new Set(
        centreSessions
          .filter((session) => session.date === selectedSession.date)
          .map((session) => session.startTime),
      ),
    ).sort((left, right) => left.localeCompare(right))
  }, [centreSessions, selectedSession])

  const classOptions = useMemo(() => {
    if (!selectedSession) return []
    return centreSessions
      .filter(
        (session) =>
          session.date === selectedSession.date &&
          session.startTime === selectedSession.startTime,
      )
      .sort(
        (left, right) =>
          left.title.localeCompare(right.title) ||
          left.instructorId.localeCompare(right.instructorId),
      )
  }, [centreSessions, selectedSession])

  function chooseSession(session: Session | undefined) {
    if (!session) return
    setSelectedSessionId(session.id)
    setSavedSessionId(null)
    const next = new URLSearchParams(searchParams)
    next.set('session', session.id)
    setSearchParams(next, { replace: true })
  }

  function handleCentreChange(nextCentreId: string) {
    chooseSession(
      pastSessions.find((session) => session.centreId === nextCentreId),
    )
    if (nextCentreId !== centreId) setCentreId(nextCentreId)
  }

  function handleDateChange(date: string) {
    chooseSession(
      centreSessions
        .filter((session) => session.date === date)
        .sort((left, right) => left.startTime.localeCompare(right.startTime))[0],
    )
  }

  function handleTimeChange(startTime: string) {
    if (!selectedSession) return
    chooseSession(
      centreSessions
        .filter(
          (session) =>
            session.date === selectedSession.date &&
            session.startTime === startTime,
        )
        .sort(
          (left, right) =>
            left.title.localeCompare(right.title) ||
            left.instructorId.localeCompare(right.instructorId),
        )[0],
    )
  }

  function handleClassChange(sessionId: string) {
    chooseSession(pastSessions.find((session) => session.id === sessionId))
  }
  const roster = useMemo(() => {
    if (!selectedSession) return []
    const base = getSessionRoster(students, selectedSession)
    const baseIds = new Set(base.map((student) => student.id))
    const recordedIds = new Set(
      attendance
        .filter((record) => record.sessionId === selectedSession.id)
        .map((record) => record.studentId),
    )
    const guests = students
      .filter((student) => !baseIds.has(student.id) && recordedIds.has(student.id))
      .sort((left, right) => left.firstName.localeCompare(right.firstName))
    return [...base, ...guests]
  }, [students, selectedSession, attendance])

  useEffect(() => {
    if (!selectedSession) return
    const next: Record<string, AttendanceStatus> = {}
    for (const student of roster) next[student.id] = 'present'
    for (const record of attendance) {
      if (record.sessionId === selectedSession.id) next[record.studentId] = record.status
    }
    setStatusesById(next)
    setRosterSearch(studentFocus ? fullName(studentFocus) : '')
  }, [selectedSession, roster, attendance, studentFocus])

  const filteredRoster = roster.filter((student) =>
    fullName(student).toLowerCase().includes(rosterSearch.trim().toLowerCase()),
  )

  const counts = roster.reduce(
    (total, student) => {
      const status = statusesById[student.id] ?? 'present'
      total[status]++
      return total
    },
    { present: 0, late: 0, absent: 0, excused: 0 } as Record<AttendanceStatus, number>,
  )

  function setStatus(studentId: string, status: AttendanceStatus) {
    setStatusesById((current) => ({ ...current, [studentId]: status }))
    setSavedSessionId(null)
  }

  function markVisible(status: AttendanceStatus) {
    setStatusesById((current) => {
      const next = { ...current }
      for (const student of filteredRoster) next[student.id] = status
      return next
    })
    setSavedSessionId(null)
  }

  function handleSave() {
    if (!selectedSession) return
    saveAttendance(
      selectedSession.id,
      roster.map((student) => ({
        studentId: student.id,
        status: statusesById[student.id] ?? 'present',
      })),
    )
    setSavedSessionId(selectedSession.id)
  }

  if (!selectedSession) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No past sessions found. Create a session before recording attendance.
          </p>
          <Button variant="outline" render={<Link to="/admin/attendance/sessions" />}>
            Go to sessions
          </Button>
        </CardContent>
      </Card>
    )
  }

  const centre = centres.find((item) => item.id === selectedSession.centreId)
  const instructor = instructors.find((item) => item.id === selectedSession.instructorId)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Select a session</CardTitle>
          <CardDescription>
            Drill down from centre to date, time, and class, then mark each student's
            attendance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PickerField
              id="attendance-centre"
              label="Centre"
              value={selectedSession.centreId}
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
                  <span className="truncate">{dateOptionLabel(selectedSession.date)}</span>
                  <CalendarDays
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-1.5">
                  <Calendar
                    mode="single"
                    required
                    selected={new Date(`${selectedSession.date}T00:00:00`)}
                    defaultMonth={new Date(`${selectedSession.date}T00:00:00`)}
                    startMonth={
                      earliestDate
                        ? new Date(`${earliestDate}T00:00:00`)
                        : undefined
                    }
                    endMonth={new Date(`${todayIso()}T00:00:00`)}
                    weekStartsOn={1}
                    disabled={(date) => !availableDates.has(toIsoDate(date))}
                    onSelect={(date) => {
                      if (!date) return
                      handleDateChange(toIsoDate(date))
                      setCalendarOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <PickerField
              id="attendance-time"
              label="Time"
              value={selectedSession.startTime}
              onChange={handleTimeChange}
            >
              {timeOptions.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </PickerField>
            <PickerField
              id="attendance-class"
              label="Class"
              value={selectedSession.id}
              onChange={handleClassChange}
            >
              {classOptions.map((session) => (
                <option key={session.id} value={session.id}>
                  {classOptionLabel(session, instructors)}
                </option>
              ))}
            </PickerField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/70 px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground">Instructor</p>
              <p className="mt-0.5 font-medium">
                {instructor ? `${instructor.firstName} ${instructor.lastName}` : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground">Session details</p>
              <p className="mt-0.5 font-medium">
                {formatDate(selectedSession.date)} · {selectedSession.startTime} ·{' '}
                {selectedSession.durationMinutes} min
              </p>
              <p className="text-xs text-muted-foreground">
                {sessionTypeLabels[selectedSession.type]}
                {selectedSession.isExternal && ' · external'}
              </p>
            </div>
          </div>

          {selectedSession.isExternal && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden="true" />
              <div>
                <p className="font-medium">External session</p>
                <p className="text-muted-foreground">
                  {selectedSession.externalLocation || 'External location not specified'} ·{' '}
                  {centre?.name}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {savedSessionId === selectedSession.id && (
        <Alert>
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          <AlertDescription>
            Attendance saved for {roster.length} students in {selectedSession.title} on{' '}
            {formatDate(selectedSession.date)}.
          </AlertDescription>
        </Alert>
      )}

      <Card className="overflow-hidden py-0">
        <CardHeader className="border-b border-border py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Roster</CardTitle>
              <CardDescription>
                {roster.length} students · {counts.present + counts.late} attended ·{' '}
                {counts.absent} absent
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={rosterSearch}
                  onChange={(event) => setRosterSearch(event.target.value)}
                  placeholder="Find a student"
                  aria-label="Find a student in the roster"
                  className="h-8 w-44 rounded-lg border border-input bg-transparent pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                />
              </div>
              <Button variant="outline" size="sm" onClick={() => markVisible('present')}>
                Mark visible present
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableCaption className="sr-only">
              Attendance roster for {selectedSession.title} on {formatDate(selectedSession.date)}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRoster.map((student) => (
                <TableRow key={student.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {initials(student.firstName, student.lastName)}
                      </span>
                      <div>
                        <p className="font-medium">{fullName(student)}</p>
                        <p className="text-xs text-muted-foreground">{student.memberNo}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{student.currentGrade}</TableCell>
                  <TableCell>
                    <div
                      role="group"
                      aria-label={`Attendance status for ${fullName(student)}`}
                      className="flex justify-end gap-1"
                    >
                      {statuses.map((status) => {
                        const active = (statusesById[student.id] ?? 'present') === status.value
                        return (
                          <button
                            key={status.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setStatus(student.id, status.value)}
                            className={cn(
                              'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                              active
                                ? `border-transparent ${status.active}`
                                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                          >
                            {status.label}
                          </button>
                        )
                      })}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredRoster.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No students match this search.
            </p>
          )}
        </CardContent>
        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <StatusBadge tone="success">{counts.present} present</StatusBadge>
            <StatusBadge tone="warning">{counts.late} late</StatusBadge>
            <StatusBadge tone="danger">{counts.absent} absent</StatusBadge>
            <StatusBadge tone="neutral">{counts.excused} excused</StatusBadge>
          </div>
          <Button onClick={handleSave}>Save attendance</Button>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        Attendance rate uses present and late as attended; excused absences are excluded.
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
