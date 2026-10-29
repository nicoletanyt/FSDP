import type { ReactNode } from 'react'
import {
  ArrowLeft,
  Bell,
  CalendarCheck,
  Mail,
  Phone,
} from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import AttendanceTrend from '@/components/admin/AttendanceTrend'
import EligibilityChecklist from '@/components/admin/EligibilityChecklist'
import EmptyState from '@/components/admin/EmptyState'
import PageHeader from '@/components/admin/PageHeader'
import Sparkline from '@/components/admin/Sparkline'
import {
  ApplicationBadge,
  AttendanceBadge,
  EligibilityBadge,
  MembershipBadge,
  RiskBadge,
  StatusBadge,
} from '@/components/admin/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAdminData } from '@/lib/admin/admin-data-context'
import {
  getAttendanceStats,
  getRiskAssessment,
  getStudentHistory,
  getStudentWeeklyTrend,
} from '@/lib/admin/attendance-risk'
import {
  formatDate,
  formatPercent,
  formatSignedPercent,
  fullName,
  initials,
  relativeDay,
} from '@/lib/admin/format'
import { getEligibilityForStudent } from '@/lib/admin/grading-eligibility'
import { cn } from 'cn'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'grading', label: 'Grading' },
  { id: 'membership', label: 'Membership' },
] as const

type TabId = (typeof tabs)[number]['id']

export default function StudentDetail() {
  const { studentId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { centres, instructors, students, attendance, sessions, opportunities, applications } =
    useAdminData()

  const student = students.find((item) => item.id === studentId)
  if (!student) {
    return (
      <EmptyState
        title="Student not found"
        description="This profile may have been removed or the link may be incorrect."
        action={<Button render={<Link to="/admin/centres" />}>Back to centres</Button>}
      />
    )
  }

  const tab = (searchParams.get('tab') as TabId | null) ?? 'overview'
  const centre = centres.find((item) => item.id === student.homeCentreId)
  const risk = getRiskAssessment(student, attendance, sessions)
  const eligibility = getEligibilityForStudent(student, attendance, sessions)
  const attendance30 = getAttendanceStats(attendance, sessions, student.id, 30)
  const attendance90 = getAttendanceStats(attendance, sessions, student.id, 90)
  const weekly = getStudentWeeklyTrend(attendance, sessions, student.id, 8)
  const history = getStudentHistory(attendance, sessions, student.id)
  const recentHistory = history.slice(0, 8)
  const studentApplications = applications.filter(
    (application) => application.studentId === student.id,
  )
  const centreNames = new Map(centres.map((item) => [item.id, item.name]))
  const instructorNames = new Map(
    instructors.map((instructor) => [
      instructor.id,
      `${instructor.firstName} ${instructor.lastName}`,
    ]),
  )
  const upcomingOpportunities = opportunities.filter(
    (opportunity) =>
      opportunity.status === 'open' &&
      opportunity.centreId === student.homeCentreId &&
      opportunity.targetGrades.includes(eligibility.targetGrade),
  )

  function selectTab(next: TabId) {
    const params = new URLSearchParams(searchParams)
    if (next === 'overview') params.delete('tab')
    else params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" render={<Link to="/admin/centres" />}>
        <ArrowLeft />
        All centres
      </Button>

      <PageHeader
        eyebrow={centre?.name}
        title={fullName(student)}
        description={`${student.memberNo} · ${student.currentGrade} · Joined ${formatDate(student.joinedAt)}`}
        actions={
          <>
            <Button
              variant="outline"
              render={<Link to={`/admin/attendance/register?student=${student.id}`} />}
            >
              <CalendarCheck />
              Record attendance
            </Button>
            <Button
              render={
                <Link to={`/admin/notifications?audience=selected&student=${student.id}`} />
              }
            >
              <Bell />
              Notify
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <Card className="w-full lg:w-72">
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initials(student.firstName, student.lastName)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{fullName(student)}</p>
                <p className="text-xs text-muted-foreground">{student.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Membership</span>
                <MembershipBadge status={student.membershipStatus} />
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Attendance risk</span>
                <RiskBadge level={risk.level} />
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">Grading</span>
                <EligibilityBadge status={eligibility.status} />
              </div>
            </div>
            <div className="space-y-1.5 border-t border-border pt-3 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground">
                <Mail className="size-4" aria-hidden="true" />
                <span className="truncate">{student.email}</span>
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="size-4" aria-hidden="true" />
                {student.phone}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 flex-1 space-y-4">
          <div role="tablist" aria-label="Student sections" className="flex flex-wrap gap-1 border-b border-border">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => selectTab(item.id)}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                  tab === item.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div role="tabpanel">
            {tab === 'overview' && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric label="30-day attendance" value={formatPercent(attendance30.rate)} />
                  <Metric label="90-day attendance" value={formatPercent(attendance90.rate)} />
                  <Metric label="Absence streak" value={`${risk.consecutiveAbsences}`} />
                  <Metric label="Last attended" value={relativeDay(risk.lastAttended ?? '')} />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Attendance health</CardTitle>
                      <CardDescription>
                        {formatPercent(risk.rate30)} in the last 30 days ·{' '}
                        <span className="text-destructive">{formatSignedPercent(risk.change)}</span>{' '}
                        vs previous period
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <RiskBadge level={risk.level} />
                        <Sparkline values={risk.weeklyRates} />
                      </div>
                      {risk.reasons.length > 0 ? (
                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                          {risk.reasons.map((reason) => (
                            <li key={reason} className="flex gap-2">
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-destructive" />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Attendance is steady. No follow-up is needed.
                        </p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => selectTab('attendance')}
                      >
                        View attendance history
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Grading readiness</CardTitle>
                      <CardDescription>
                        Target grade: {eligibility.targetGrade} · {eligibility.metCount} of{' '}
                        {eligibility.total} requirements met
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <EligibilityChecklist requirements={eligibility.requirements} compact />
                      <Button variant="outline" size="sm" onClick={() => selectTab('grading')}>
                        Open grading record
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent attendance</CardTitle>
                    <CardDescription>Last eight recorded sessions.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {recentHistory.length ? (
                      <div className="space-y-2">
                        {recentHistory.map(({ record, session }) => (
                          <div
                            key={record.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">{session.title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {formatDate(session.date)} · {centreNames.get(session.centreId)}
                                {session.isExternal && ' · External'}
                              </p>
                            </div>
                            <AttendanceBadge status={record.status} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === 'attendance' && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric label="30-day attendance" value={formatPercent(attendance30.rate)} />
                  <Metric label="90-day attendance" value={formatPercent(attendance90.rate)} />
                  <Metric label="Sessions attended" value={`${attendance90.attended}`} />
                  <Metric label="Absences (90 days)" value={`${attendance90.absences}`} />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Attendance trend</CardTitle>
                    <CardDescription>Weekly attendance across all sessions.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AttendanceTrend data={weekly} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Attendance history</CardTitle>
                    <CardDescription>
                      Includes external sessions and seminars.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {history.length ? (
                      <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                        {history.map(({ record, session }) => (
                          <div
                            key={record.id}
                            className="flex flex-col gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {session.title}
                                {session.isExternal && (
                                  <span className="ml-2">
                                    <StatusBadge tone="warning">External</StatusBadge>
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {formatDate(session.date)} · {session.startTime} ·{' '}
                                {centreNames.get(session.centreId)} ·{' '}
                                {instructorNames.get(session.instructorId)}
                              </p>
                            </div>
                            <AttendanceBadge status={record.status} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === 'grading' && (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Grading eligibility</CardTitle>
                    <CardDescription>
                      {student.currentGrade} → {eligibility.targetGrade} ·{' '}
                      {eligibility.metCount} of {eligibility.total} requirements met
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <EligibilityBadge status={eligibility.status} />
                    <EligibilityChecklist requirements={eligibility.requirements} />
                  </CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Grading record</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <Row label="Current grade" value={student.currentGrade} />
                      <Row
                        label="Last grading"
                        value={
                          student.lastGradedAt
                            ? formatDate(student.lastGradedAt)
                            : 'No grading recorded'
                        }
                      />
                      <Row label="Next grade" value={eligibility.targetGrade} />
                      <Row label="Centre" value={centre?.name ?? '—'} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Upcoming opportunities</CardTitle>
                      <CardDescription>
                        Open opportunities matching the next grade.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {upcomingOpportunities.length ? (
                        upcomingOpportunities.map((opportunity) => (
                          <div
                            key={opportunity.id}
                            className="rounded-lg border border-border/70 p-3 text-sm"
                          >
                            <p className="font-medium">{opportunity.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatDate(opportunity.date)} · apply by{' '}
                              {formatDate(opportunity.applicationDeadline)}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No matching opportunities. Create one from the Grading hub.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Applications</CardTitle>
                    <CardDescription>Read-only submissions from the student portal.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {studentApplications.length ? (
                      <div className="space-y-2">
                        {studentApplications.map((application) => {
                          const opportunity = opportunities.find(
                            (item) => item.id === application.opportunityId,
                          )
                          return (
                            <div
                              key={application.id}
                              className="flex flex-col gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="font-medium">{opportunity?.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  Target {application.targetGrade} · submitted{' '}
                                  {formatDate(application.submittedAt)}
                                </p>
                              </div>
                              <ApplicationBadge status={application.status} />
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No grading applications submitted.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {tab === 'membership' && (
              <Card>
                <CardHeader>
                  <CardTitle>Membership record</CardTitle>
                  <CardDescription>Profile and membership details.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <Row label="Member number" value={student.memberNo} />
                  <Row label="Home centre" value={centre?.name ?? '—'} />
                  <Row label="Membership status" value={<MembershipBadge status={student.membershipStatus} />} />
                  <Row label="Joined" value={formatDate(student.joinedAt)} />
                  <Row label="Current grade" value={student.currentGrade} />
                  <Row
                    label="Fees"
                    value={student.outstandingFees ? 'Outstanding' : 'Up to date'}
                  />
                  <Row label="Email" value={student.email} />
                  <Row label="Phone" value={student.phone} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
