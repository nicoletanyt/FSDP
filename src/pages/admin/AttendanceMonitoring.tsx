import { Fragment, useMemo, useState } from 'react'
import { AlertTriangle, Bell, CheckCircle2, ChevronDown, Search } from 'lucide-react'
import { Link } from 'react-router'
import EmptyState from '@/components/admin/EmptyState'
import Sparkline from '@/components/admin/Sparkline'
import { RiskBadge } from '@/components/admin/StatusBadge'
import { NativeSelect } from '@/components/admin/form-controls'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { getRiskAssessments } from '@/lib/admin/attendance-risk'
import {
  formatPercent,
  formatSignedPercent,
  fullName,
  initials,
  relativeDay,
} from '@/lib/admin/format'
import type { FollowUpStatus, RiskLevel } from '@/lib/admin/types'
import { cn } from 'cn'

const followUpOptions: { value: FollowUpStatus; label: string }[] = [
  { value: 'none', label: 'Not flagged' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'resolved', label: 'Resolved' },
]

export default function AttendanceMonitoring() {
  const { centres, students, attendance, sessions, sendNotification, updateFollowUp } =
    useAdminData()
  const { centreId } = useAdminFilters()
  const [levelFilter, setLevelFilter] = useState('flagged')
  const [followUpFilter, setFollowUpFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const centreNames = new Map(centres.map((centre) => [centre.id, centre.name]))
  const scopedStudents = useMemo(
    () =>
      students.filter(
        (student) => centreId === 'all' || student.homeCentreId === centreId,
      ),
    [students, centreId],
  )

  const assessments = useMemo(
    () => getRiskAssessments(scopedStudents, attendance, sessions),
    [scopedStudents, attendance, sessions],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return assessments
      .filter((assessment) => {
        if (levelFilter === 'all') return true
        if (levelFilter === 'flagged') {
          return assessment.level === 'at_risk' || assessment.level === 'critical'
        }
        return assessment.level === (levelFilter as RiskLevel)
      })
      .filter((assessment) => {
        const student = scopedStudents.find((item) => item.id === assessment.studentId)
        if (!student) return false
        return followUpFilter === 'all' || student.followUpStatus === followUpFilter
      })
      .filter((assessment) => {
        if (!needle) return true
        const student = scopedStudents.find((item) => item.id === assessment.studentId)
        return student
          ? [fullName(student), student.memberNo, student.email].some((value) =>
              value.toLowerCase().includes(needle),
            )
          : false
      })
  }, [assessments, levelFilter, followUpFilter, query, scopedStudents])

  const allSelected = filtered.length > 0 && filtered.every((assessment) => selected.has(assessment.studentId))

  function toggleAll() {
    setSelected((current) => {
      const next = new Set(current)
      if (allSelected) {
        for (const assessment of filtered) next.delete(assessment.studentId)
      } else {
        for (const assessment of filtered) next.add(assessment.studentId)
      }
      return next
    })
  }

  function toggleOne(studentId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(studentId)) next.delete(studentId)
      else next.add(studentId)
      return next
    })
  }

  function notifyStudents(studentIds: string[], label: string) {
    if (studentIds.length === 0) return
    sendNotification({
      channel: 'email',
      template: 'Attendance concern',
      audience: label,
      recipientCount: studentIds.length,
    })
    setNotice(
      `Attendance concern queued for ${studentIds.length} ${
        studentIds.length === 1 ? 'student' : 'students'
      }.`,
    )
  }

  function markSelected(status: FollowUpStatus) {
    for (const studentId of selected) updateFollowUp(studentId, status)
    setNotice(`${selected.size} students marked as ${status}.`)
    setSelected(new Set())
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden="true" />
        <p className="text-muted-foreground">
          A student is flagged when their 30-day attendance is below 70%, attendance
          drops by 15 points or more, or they have 3 or more consecutive absences.
        </p>
      </div>

      {notice && (
        <Alert>
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

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
            placeholder="Find a student"
            aria-label="Search monitored students"
            className="h-8 w-full rounded-lg border border-input bg-transparent pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>
        <div className="w-40">
          <NativeSelect
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
            aria-label="Filter by risk level"
          >
            <option value="flagged">At risk & critical</option>
            <option value="all">All levels</option>
            <option value="critical">Critical</option>
            <option value="at_risk">At risk</option>
            <option value="watch">Watch</option>
          </NativeSelect>
        </div>
        <div className="w-36">
          <NativeSelect
            value={followUpFilter}
            onChange={(event) => setFollowUpFilter(event.target.value)}
            aria-label="Filter by follow-up status"
          >
            <option value="all">All follow-ups</option>
            <option value="none">Not flagged</option>
            <option value="flagged">Flagged</option>
            <option value="contacted">Contacted</option>
            <option value="resolved">Resolved</option>
          </NativeSelect>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            notifyStudents(
              [...selected],
              `Selected students (${selected.size})`,
            )
          }
          disabled={selected.size === 0}
        >
          <Bell />
          Notify selected
        </Button>
        <Button
          variant="outline"
          onClick={() => markSelected('flagged')}
          disabled={selected.size === 0}
        >
          Mark follow-up
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No students match this view"
          description="Try a different risk level or follow-up status, or clear the search."
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            <Table>
              <TableCaption className="sr-only">Students with declining attendance</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input accent-[var(--primary)]"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all visible students"
                    />
                  </TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="text-right">30-day</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Absence streak</TableHead>
                  <TableHead>Last attended</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Follow-up</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((assessment) => {
                  const student = scopedStudents.find(
                    (item) => item.id === assessment.studentId,
                  )
                  if (!student) return null
                  const isExpanded = expanded === student.id
                  return (
                    <Fragment key={student.id}>
                      <TableRow>
                        <TableCell>
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input accent-[var(--primary)]"
                            checked={selected.has(student.id)}
                            onChange={() => toggleOne(student.id)}
                            aria-label={`Select ${fullName(student)}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 items-center justify-center rounded-full bg-destructive/10 text-xs font-semibold text-destructive">
                              {initials(student.firstName, student.lastName)}
                            </span>
                            <div>
                              <p className="font-medium">{fullName(student)}</p>
                              <p className="text-xs text-muted-foreground">
                                {centreNames.get(student.homeCentreId)} · {student.currentGrade}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <RiskBadge level={assessment.level} />
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatPercent(assessment.rate30)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right text-xs font-medium tabular-nums',
                            assessment.change < 0 ? 'text-destructive' : 'text-muted-foreground',
                          )}
                        >
                          {formatSignedPercent(assessment.change)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {assessment.consecutiveAbsences}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {relativeDay(assessment.lastAttended ?? '')}
                        </TableCell>
                        <TableCell>
                          <Sparkline
                            values={assessment.weeklyRates}
                            tone={
                              assessment.level === 'critical'
                                ? 'var(--destructive)'
                                : 'var(--warning)'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <NativeSelect
                            value={student.followUpStatus}
                            onChange={(event) =>
                              updateFollowUp(
                                student.id,
                                event.target.value as FollowUpStatus,
                              )
                            }
                            aria-label={`Follow-up status for ${fullName(student)}`}
                            className="h-7 w-32 text-xs"
                          >
                            {followUpOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </NativeSelect>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Why ${fullName(student)} is flagged`}
                              onClick={() =>
                                setExpanded(isExpanded ? null : student.id)
                              }
                            >
                              <ChevronDown
                                className={cn(
                                  'transition-transform',
                                  isExpanded && 'rotate-180',
                                )}
                              />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Notify ${fullName(student)}`}
                              onClick={() =>
                                notifyStudents(
                                  [student.id],
                                  `Selected student — ${fullName(student)}`,
                                )
                              }
                            >
                              <Bell />
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              render={<Link to={`/admin/students/${student.id}`} />}
                            >
                              View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={10} className="bg-muted/30">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Why flagged
                            </p>
                            <ul className="mt-2 space-y-1 text-sm">
                              {assessment.reasons.length ? (
                                assessment.reasons.map((reason) => (
                                  <li key={reason} className="flex gap-2">
                                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
                                    {reason}
                                  </li>
                                ))
                              ) : (
                                <li>No active flags — this student is being watched.</li>
                              )}
                            </ul>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
