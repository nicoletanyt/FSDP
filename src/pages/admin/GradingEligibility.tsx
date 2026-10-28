import { Fragment, useMemo, useState } from 'react'
import { Bell, CheckCircle2, ChevronDown, Search } from 'lucide-react'
import EmptyState from '@/components/admin/EmptyState'
import EligibilityChecklist from '@/components/admin/EligibilityChecklist'
import { EligibilityBadge } from '@/components/admin/StatusBadge'
import { NativeSelect } from '@/components/admin/form-controls'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { getAttendanceStats } from '@/lib/admin/attendance-risk'
import {
  formatDate,
  formatPercent,
  fullName,
  initials,
} from '@/lib/admin/format'
import { getEligibilityAssessments } from '@/lib/admin/grading-eligibility'
import type { Grade } from '@/lib/admin/types'
import { grades } from '@/lib/admin/types'
import { cn } from 'cn'

export default function GradingEligibility() {
  const { centres, students, attendance, sessions, sendNotification } = useAdminData()
  const { centreId } = useAdminFilters()
  const [statusFilter, setStatusFilter] = useState('all')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [query, setQuery] = useState('')
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
    () => getEligibilityAssessments(scopedStudents, attendance, sessions),
    [scopedStudents, attendance, sessions],
  )

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return assessments
      .filter(
        (assessment) => statusFilter === 'all' || assessment.status === statusFilter,
      )
      .filter(
        (assessment) =>
          gradeFilter === 'all' || assessment.targetGrade === (gradeFilter as Grade),
      )
      .filter((assessment) => {
        if (!needle) return true
        const student = scopedStudents.find((item) => item.id === assessment.studentId)
        return student
          ? [fullName(student), student.memberNo, student.email].some((value) =>
              value.toLowerCase().includes(needle),
            )
          : false
      })
  }, [assessments, statusFilter, gradeFilter, query, scopedStudents])

  const eligible = assessments.filter((assessment) => assessment.status === 'eligible')
  const almost = assessments.filter((assessment) => assessment.status === 'almost')
  const notEligible = assessments.filter(
    (assessment) => assessment.status === 'not_eligible',
  )

  function notifyEligible() {
    if (eligible.length === 0) return
    sendNotification({
      channel: 'email',
      template: 'Grading invitation',
      audience:
        centreId === 'all'
          ? 'Eligible students — all centres'
          : `Eligible students — ${centreNames.get(centreId) ?? 'selected centre'}`,
      recipientCount: eligible.length,
    })
    setNotice(`Grading invitation queued for ${eligible.length} eligible students.`)
  }

  return (
    <div className="space-y-4">
      {notice && (
        <Alert>
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Eligible now" value={eligible.length} tone="text-success" />
        <Summary label="One requirement left" value={almost.length} tone="text-warning-foreground dark:text-warning" />
        <Summary label="Not yet eligible" value={notEligible.length} />
      </div>

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
            aria-label="Search eligibility by student"
            className="h-8 w-full rounded-lg border border-input bg-transparent pr-2.5 pl-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
        </div>
        <div className="w-36">
          <NativeSelect
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by eligibility status"
          >
            <option value="all">All statuses</option>
            <option value="eligible">Eligible</option>
            <option value="almost">Almost</option>
            <option value="not_eligible">Not eligible</option>
          </NativeSelect>
        </div>
        <div className="w-32">
          <NativeSelect
            value={gradeFilter}
            onChange={(event) => setGradeFilter(event.target.value)}
            aria-label="Filter by target grade"
          >
            <option value="all">All grades</option>
            {grades.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button variant="outline" onClick={notifyEligible} disabled={eligible.length === 0}>
          <Bell />
          Notify eligible ({eligible.length})
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No students match these filters"
          description="Try another eligibility status or target grade."
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="px-0">
            <Table>
              <TableCaption className="sr-only">
                Grading eligibility assessments
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Centre</TableHead>
                  <TableHead>Next grade</TableHead>
                  <TableHead>Requirements</TableHead>
                  <TableHead className="text-right">90-day attendance</TableHead>
                  <TableHead>Last graded</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((assessment) => {
                  const student = scopedStudents.find(
                    (item) => item.id === assessment.studentId,
                  )
                  if (!student) return null
                  const attendance90 = getAttendanceStats(
                    attendance,
                    sessions,
                    student.id,
                    90,
                  )
                  const isExpanded = expanded === student.id
                  return (
                    <Fragment key={student.id}>
                      <TableRow>
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
                        <TableCell className="text-muted-foreground">
                          {centreNames.get(student.homeCentreId)}
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">{student.currentGrade}</span>{' '}
                          → <span className="font-medium">{assessment.targetGrade}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium tabular-nums">
                              {assessment.metCount}/{assessment.total}
                            </span>
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  'h-full rounded-full',
                                  assessment.status === 'eligible'
                                    ? 'bg-success'
                                    : assessment.status === 'almost'
                                      ? 'bg-warning'
                                      : 'bg-destructive',
                                )}
                                style={{
                                  width: `${(assessment.metCount / assessment.total) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPercent(attendance90.rate)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {student.lastGradedAt ? formatDate(student.lastGradedAt) : 'Never'}
                        </TableCell>
                        <TableCell>
                          <EligibilityBadge status={assessment.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`Show requirements for ${fullName(student)}`}
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
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30">
                            <div className="max-w-2xl">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Requirement breakdown
                              </p>
                              <EligibilityChecklist
                                requirements={assessment.requirements}
                                compact
                              />
                            </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Eligibility rules</CardTitle>
          <CardDescription>
            Read-only rules applied automatically to every student.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p>• Active membership</p>
          <p>• 20 training sessions since last grading (30 for Shodan/Nidan)</p>
          <p>• 75% attendance over the last 90 days</p>
          <p>• 4 months in the current grade (6 for Shodan/Nidan)</p>
          <p>• No outstanding fees</p>
          <p>• The next grade is determined from the current grade</p>
        </CardContent>
      </Card>
    </div>
  )
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: string
}) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  )
}
