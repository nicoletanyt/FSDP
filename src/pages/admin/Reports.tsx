import { Download } from 'lucide-react'
import AttendanceTrend from '@/components/admin/AttendanceTrend'
import PageHeader from '@/components/admin/PageHeader'
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
import { getCentreStats } from '@/lib/admin/analytics'
import { getWeeklyAttendanceTrend } from '@/lib/admin/attendance-risk'
import { downloadCsv } from '@/lib/admin/export'
import { formatPercent } from '@/lib/admin/format'
import { getEligibilityAssessments } from '@/lib/admin/grading-eligibility'

export default function Reports() {
  const { centres, students, attendance, sessions, applications, opportunities } =
    useAdminData()
  const { centreId } = useAdminFilters()

  const trend = getWeeklyAttendanceTrend(attendance, sessions, centreId, 12)
  const stats = getCentreStats(centres, students, attendance, sessions).filter(
    (item) => centreId === 'all' || item.centreId === centreId,
  )
  const scopedStudents = students.filter(
    (student) => centreId === 'all' || student.homeCentreId === centreId,
  )
  const eligible = getEligibilityAssessments(scopedStudents, attendance, sessions).filter(
    (assessment) => assessment.status === 'eligible',
  ).length
  const scopedApplications = applications.filter((application) => {
    const student = students.find((item) => item.id === application.studentId)
    return centreId === 'all' || student?.homeCentreId === centreId
  }).length
  const scopedOpportunities = opportunities.filter(
    (opportunity) => centreId === 'all' || opportunity.centreId === centreId,
  ).length

  const centreNames = new Map(centres.map((centre) => [centre.id, centre.name]))

  function exportReport() {
    downloadCsv(
      'centre-report.csv',
      ['Centre', 'Students', 'Active memberships', 'Attendance rate', 'Declining', 'Eligible to grade'],
      stats.map((item) => [
        centreNames.get(item.centreId) ?? '',
        item.studentCount,
        item.activeCount,
        `${Math.round(item.attendanceRate)}%`,
        item.decliningCount,
        item.eligibleCount,
      ]),
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Reports"
        title="Centre reporting"
        description="A consolidated view of attendance, membership, and grading readiness."
        actions={
          <Button variant="outline" onClick={exportReport}>
            <Download />
            Export centre report
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Students in scope" value={`${scopedStudents.length}`} />
        <Metric label="Eligible to grade" value={`${eligible}`} />
        <Metric label="Applications" value={`${scopedApplications}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Attendance trend</CardTitle>
          <CardDescription>Twelve weeks across the selected centres.</CardDescription>
        </CardHeader>
        <CardContent>
          <AttendanceTrend data={trend} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden py-0">
        <CardHeader className="border-b border-border py-4">
          <CardTitle>Centre performance</CardTitle>
          <CardDescription>
            {scopedOpportunities} grading opportunities in scope.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableCaption className="sr-only">Centre performance report</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Centre</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Active</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="text-right">Declining</TableHead>
                <TableHead className="text-right">Eligible</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((item) => (
                <TableRow key={item.centreId}>
                  <TableCell className="font-medium">
                    {centreNames.get(item.centreId)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.studentCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.activeCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(item.attendanceRate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.decliningCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.eligibleCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
