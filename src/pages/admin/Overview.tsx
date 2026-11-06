import {
  AlertTriangle,
  CalendarCheck,
  ChevronRight,
  GraduationCap,
  Users,
} from 'lucide-react'
import { Link } from 'react-router'
import AttendanceTrend from '@/components/admin/AttendanceTrend'
import PageHeader from '@/components/admin/PageHeader'
import StatCard from '@/components/admin/StatCard'
import { RiskBadge } from '@/components/admin/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { useAdminFilters } from '@/lib/admin/admin-filters'
import {
  getDecliningAssessments,
  getWeeklyAttendanceTrend,
} from '@/lib/admin/attendance-risk'
import { fullName, initials } from '@/lib/admin/format'
import { getEligibilityAssessments } from '@/lib/admin/grading-eligibility'

export default function Overview() {
  const { centres, students, attendance, sessions, opportunities, applications, notifications, techniqueSignOffs } =
    useAdminData()
  const { centreId } = useAdminFilters()

  const scopedStudents = students.filter(
    (student) => centreId === 'all' || student.homeCentreId === centreId,
  )
  const declining = getDecliningAssessments(scopedStudents, attendance, sessions)
  const eligibility = getEligibilityAssessments(
    scopedStudents,
    attendance,
    sessions,
    techniqueSignOffs,
  )
  const eligible = eligibility.filter((assessment) => assessment.status === 'eligible')
  const trend = getWeeklyAttendanceTrend(attendance, sessions, centreId, 12)
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dojo operations"
        actions={
          <Button render={<Link to="/admin/calendar" />}>
            <CalendarCheck />
            Record attendance
          </Button>
        }
      />

      <section aria-label="Key figures" className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <StatCard
          label="Active students"
          value={`${scopedStudents.filter((student) => student.membershipStatus === 'active').length}`}
          detail={`of ${scopedStudents.length} students`}
          icon={Users}
          to="/admin/centres?tab=students"
        />
        <StatCard
          label="Needs attention"
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
          to="/admin/grading/eligibility"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Attendance trend</CardTitle>
          <CardDescription>Weekly attendance across the selected centres.</CardDescription>
        </CardHeader>
        <CardContent>
          <AttendanceTrend data={trend} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <CardTitle>Needs attention</CardTitle>
              <Button variant="ghost" size="sm" render={<Link to="/admin/calendar/monitoring" />}>
                View all
                <ChevronRight />
              </Button>
            </div>
            <CardDescription>
              Students with no booked classes in the last 30 days or at least two consecutive missed bookings.
            </CardDescription>
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
                        {centreNames.get(student.homeCentreId)} · {student.currentGrade}
                      </p>
                      <p className="text-xs text-muted-foreground">{assessment.reasons.join(' · ')}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
                No students need attendance follow-up right now.
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
