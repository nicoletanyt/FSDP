import {
  AlertTriangle,
  CalendarCheck,
  ChevronRight,
  GraduationCap,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'
import AttendanceTrend from '@/components/admin/AttendanceTrend'
import CentreComparison from '@/components/admin/CentreComparison'
import PageHeader from '@/components/admin/PageHeader'
import StatCard from '@/components/admin/StatCard'
import {
  RiskBadge,
  StatusBadge,
} from '@/components/admin/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import {
  getDecliningAssessments,
  getOverallAttendanceRate,
  getWeeklyAttendanceTrend,
} from '@/lib/admin/attendance-risk'
import { getCentreStats, getUpcomingSessions } from '@/lib/admin/analytics'
import {
  formatPercent,
  formatShortDate,
  formatSignedPercent,
  fullName,
  initials,
  relativeDay,
} from '@/lib/admin/format'
import { getEligibilityAssessments } from '@/lib/admin/grading-eligibility'

export default function Overview() {
  const { centres, instructors, students, attendance, sessions, opportunities, applications, notifications } =
    useAdminData()
  const { centreId, dateRange } = useAdminFilters()

  const scopedStudents = students.filter(
    (student) => centreId === 'all' || student.homeCentreId === centreId,
  )
  const declining = getDecliningAssessments(scopedStudents, attendance, sessions)
  const eligibility = getEligibilityAssessments(scopedStudents, attendance, sessions)
  const eligible = eligibility.filter((assessment) => assessment.status === 'eligible')
  const attendanceRate = getOverallAttendanceRate(
    attendance,
    sessions,
    centreId,
    dateRange,
  )
  const trend = getWeeklyAttendanceTrend(attendance, sessions, centreId, 8)
  const trendChange =
    trend.length >= 2 ? trend[trend.length - 1].rate - trend[trend.length - 2].rate : 0
  const centreStats = getCentreStats(centres, students, attendance, sessions).filter(
    (stats) => centreId === 'all' || stats.centreId === centreId,
  )
  const upcoming = getUpcomingSessions(sessions, centreId, 5)
  const scopedApplications = applications.filter((application) => {
    const student = students.find((item) => item.id === application.studentId)
    return centreId === 'all' || student?.homeCentreId === centreId
  })
  const scopedOpportunities = opportunities.filter(
    (opportunity) => centreId === 'all' || opportunity.centreId === centreId,
  )
  const selectedCentreName =
    centreId === 'all'
      ? null
      : centres.find((centre) => centre.id === centreId)?.name ?? null
  const invited = notifications
    .filter(
      (notification) =>
        notification.template === 'Grading invitation' &&
        (!selectedCentreName || notification.audience.includes(selectedCentreName)),
    )
    .reduce((total, notification) => total + notification.recipientCount, 0)

  const centreNames = new Map(centres.map((centre) => [centre.id, centre.name]))
  const instructorNames = new Map(
    instructors.map((instructor) => [
      instructor.id,
      `${instructor.firstName} ${instructor.lastName}`,
    ]),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Dojo operations"
        description="Monitor attendance, spot students who need support, and keep the grading pipeline moving across every centre."
        actions={
          <Button render={<Link to="/admin/attendance/register" />}>
            <CalendarCheck />
            Record attendance
          </Button>
        }
      />

      <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active students"
          value={`${scopedStudents.filter((student) => student.membershipStatus === 'active').length}`}
          detail={`of ${scopedStudents.length} students`}
          icon={Users}
        />
        <StatCard
          label={`${dateRange}-day attendance`}
          value={formatPercent(attendanceRate)}
          change={trendChange}
          detail="vs previous week"
          icon={CalendarCheck}
          tone={attendanceRate >= 80 ? 'success' : attendanceRate >= 70 ? 'warning' : 'danger'}
        />
        <StatCard
          label="Declining students"
          value={`${declining.length}`}
          detail={`${declining.filter((item) => item.level === 'critical').length} critical`}
          icon={AlertTriangle}
          tone={declining.length > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="Eligible to grade"
          value={`${eligible.length}`}
          detail={`${scopedApplications.length} applications received`}
          icon={GraduationCap}
          tone="default"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Attendance trend</CardTitle>
            <CardDescription>Last eight weeks across the selected centres.</CardDescription>
          </CardHeader>
          <CardContent>
            <AttendanceTrend data={trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Centre comparison</CardTitle>
            <CardDescription>30-day attendance rate by centre.</CardDescription>
          </CardHeader>
          <CardContent>
            <CentreComparison
              data={centreStats}
              names={Object.fromEntries(centres.map((centre) => [centre.id, centre.shortName]))}
            />
            <div className="mt-3 space-y-1.5 text-sm">
              {centreStats.map((stats) => (
                <div key={stats.centreId} className="flex items-center justify-between gap-3">
                  <span className="truncate text-muted-foreground">
                    {centreNames.get(stats.centreId)}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {stats.studentCount} students · {stats.decliningCount} declining
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>
                Students flagged for low or declining attendance.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" render={<Link to="/admin/attendance/monitoring" />}>
              View all
              <ChevronRight />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {declining.slice(0, 5).map((assessment) => {
              const student = students.find((item) => item.id === assessment.studentId)
              if (!student) return null
              return (
                <div
                  key={assessment.studentId}
                  className="flex flex-col gap-3 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-xs font-semibold text-destructive">
                      {initials(student.firstName, student.lastName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{fullName(student)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {centreNames.get(student.homeCentreId)} · {student.currentGrade} · last
                        attended {relativeDay(assessment.lastAttended ?? '')}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <span className="text-sm font-medium tabular-nums">
                      {formatPercent(assessment.rate30)}
                    </span>
                    <span className="text-xs font-medium text-destructive tabular-nums">
                      {formatSignedPercent(assessment.change)}
                    </span>
                    <RiskBadge level={assessment.level} />
                    <Button
                      variant="outline"
                      size="xs"
                      render={<Link to={`/admin/students/${student.id}`} />}
                    >
                      View
                    </Button>
                  </div>
                </div>
              )
            })}
            {declining.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No declining students in this period.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Upcoming sessions</CardTitle>
                <CardDescription>Next classes across the dojos.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" render={<Link to="/admin/attendance/sessions" />}>
                All sessions
                <ChevronRight />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcoming.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{session.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatShortDate(session.date)} · {session.startTime} ·{' '}
                      {centreNames.get(session.centreId)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {instructorNames.get(session.instructorId)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {session.isExternal && (
                      <StatusBadge tone="warning">External</StatusBadge>
                    )}
                    <Button
                      variant="outline"
                      size="xs"
                      render={<Link to={`/admin/attendance/sessions`} />}
                    >
                      Manage
                    </Button>
                  </div>
                </div>
              ))}
              {upcoming.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  No upcoming sessions.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Grading pipeline</CardTitle>
              <CardDescription>
                {scopedOpportunities.filter((opportunity) => opportunity.status === 'open').length}{' '}
                open opportunities
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <PipelineRow
                label="Eligible now"
                value={eligible.length}
                max={Math.max(eligible.length, invited, scopedApplications.length, 1)}
                tone="bg-primary"
              />
              <PipelineRow
                label="Invited"
                value={invited}
                max={Math.max(eligible.length, invited, scopedApplications.length, 1)}
                tone="bg-warning"
              />
              <PipelineRow
                label="Applications"
                value={scopedApplications.length}
                max={Math.max(eligible.length, invited, scopedApplications.length, 1)}
                tone="bg-success"
              />
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" render={<Link to="/admin/grading/eligibility" />}>
                  Eligibility
                </Button>
                <Button variant="outline" size="sm" render={<Link to="/admin/grading/applications" />}>
                  Applications
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function PipelineRow({
  label,
  value,
  max,
  tone,
}: {
  label: string
  value: number
  max: number
  tone: string
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  )
}
