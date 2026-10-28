import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import EmptyState from '@/components/admin/EmptyState'
import { AttendanceBadge, StatusBadge } from '@/components/admin/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { downloadCsv } from '@/lib/admin/export'
import { daysAgoIso, formatDate, fullName } from '@/lib/admin/format'
import { NativeSelect } from '@/components/admin/form-controls'

export default function AttendanceRecords() {
  const { centres, instructors, students, sessions, attendance } = useAdminData()
  const { centreId } = useAdminFilters()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [days, setDays] = useState(30)
  const [externalOnly, setExternalOnly] = useState(false)

  const centreNames = new Map(centres.map((centre) => [centre.id, centre.name]))
  const instructorNames = new Map(
    instructors.map((instructor) => [
      instructor.id,
      `${instructor.firstName} ${instructor.lastName}`,
    ]),
  )
  const studentById = new Map(students.map((student) => [student.id, student]))
  const sessionById = new Map(sessions.map((session) => [session.id, session]))

  const records = useMemo(() => {
    const cutoff = daysAgoIso(days - 1)
    const needle = query.trim().toLowerCase()
    return attendance
      .map((record) => ({
        record,
        session: sessionById.get(record.sessionId),
        student: studentById.get(record.studentId),
      }))
      .filter((entry) => Boolean(entry.session && entry.student))
      .map((entry) => ({
        record: entry.record,
        session: entry.session!,
        student: entry.student!,
      }))
      .filter(({ session }) => centreId === 'all' || session.centreId === centreId)
      .filter(({ session }) => session.date >= cutoff)
      .filter(({ session }) => !externalOnly || session.isExternal)
      .filter(({ record }) => status === 'all' || record.status === status)
      .filter(({ student }) => {
        if (!needle) return true
        return [fullName(student), student.memberNo, student.email].some((value) =>
          value.toLowerCase().includes(needle),
        )
      })
      .sort((left, right) =>
        `${right.session.date}T${right.session.startTime}`.localeCompare(
          `${left.session.date}T${left.session.startTime}`,
        ),
      )
  }, [attendance, sessionById, studentById, centreId, days, externalOnly, status, query])

  const summary = records.reduce(
    (total, entry) => {
      total[entry.record.status]++
      return total
    },
    { present: 0, late: 0, absent: 0, excused: 0 },
  )

  const visible = records.slice(0, 200)

  function exportRecords() {
    downloadCsv(
      'attendance-records.csv',
      ['Date', 'Session', 'Centre', 'Instructor', 'Student', 'Status', 'Source'],
      records.map(({ record, session, student }) => [
        session.date,
        session.title,
        centreNames.get(session.centreId) ?? '',
        instructorNames.get(session.instructorId) ?? '',
        fullName(student),
        record.status,
        session.isExternal ? 'External' : 'Regular',
      ]),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search student"
            aria-label="Search attendance by student"
            className="h-8 w-full rounded-lg border border-input bg-transparent pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>
        <div className="w-36">
          <NativeSelect
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by attendance status"
          >
            <option value="all">All statuses</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
            <option value="excused">Excused</option>
          </NativeSelect>
        </div>
        <div className="w-32">
          <NativeSelect
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            aria-label="Date range"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </NativeSelect>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
          <input
            type="checkbox"
            className="size-4 rounded border-input accent-[var(--primary)]"
            checked={externalOnly}
            onChange={(event) => setExternalOnly(event.target.checked)}
          />
          External only
        </label>
        <Button variant="outline" onClick={exportRecords} disabled={records.length === 0}>
          <Download />
          Export
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <StatusBadge tone="success">{summary.present} present</StatusBadge>
        <StatusBadge tone="warning">{summary.late} late</StatusBadge>
        <StatusBadge tone="danger">{summary.absent} absent</StatusBadge>
        <StatusBadge tone="neutral">{summary.excused} excused</StatusBadge>
        <span className="self-center">
          {records.length} records · showing {visible.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No attendance records match these filters"
          description="Try a wider date range, a different status, or clear the student search."
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            <Table>
              <TableCaption className="sr-only">Attendance records</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Centre</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Recorded by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(({ record, session, student }) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(session.date)}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{fullName(student)}</p>
                      <p className="text-xs text-muted-foreground">{student.memberNo}</p>
                    </TableCell>
                    <TableCell>
                      <p>{session.title}</p>
                      <p className="text-xs text-muted-foreground">{session.startTime}</p>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {centreNames.get(session.centreId)}
                    </TableCell>
                    <TableCell>
                      <AttendanceBadge status={record.status} />
                    </TableCell>
                    <TableCell>
                      {session.isExternal ? (
                        <StatusBadge tone="warning">External</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Regular</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {record.recordedBy}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
