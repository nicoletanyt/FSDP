import { Link } from 'react-router'
import { ArrowUpRight, Bell, CalendarCheck } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { useAdminData } from '@/lib/admin/admin-data-context'
import { getRiskAssessment } from '@/lib/admin/attendance-risk'
import { formatPercent, fullName, initials, relativeDay } from '@/lib/admin/format'
import { getEligibilityForStudent } from '@/lib/admin/grading-eligibility'
import type { Student } from '@/lib/admin/types'
import { EligibilityBadge, MembershipBadge, RiskBadge } from './StatusBadge'

export default function StudentTable({
  students,
  showCentre = true,
  caption = 'Students',
}: {
  students: Student[]
  showCentre?: boolean
  caption?: string
}) {
  const { centres, attendance, sessions } = useAdminData()
  const centreNames = new Map(centres.map((centre) => [centre.id, centre.name]))

  return (
    <Table>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Student</TableHead>
          {showCentre && <TableHead>Centre</TableHead>}
          <TableHead>Grade</TableHead>
          <TableHead>Membership</TableHead>
          <TableHead className="text-right">30-day attendance</TableHead>
          <TableHead>Grading</TableHead>
          <TableHead>Last attended</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => {
          const risk = getRiskAssessment(student, attendance, sessions)
          const eligibility = getEligibilityForStudent(student, attendance, sessions)
          return (
            <TableRow key={student.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initials(student.firstName, student.lastName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{fullName(student)}</p>
                    <p className="text-xs text-muted-foreground">{student.memberNo}</p>
                  </div>
                </div>
              </TableCell>
              {showCentre && (
                <TableCell className="text-muted-foreground">
                  {centreNames.get(student.homeCentreId)}
                </TableCell>
              )}
              <TableCell>{student.currentGrade}</TableCell>
              <TableCell>
                <MembershipBadge status={student.membershipStatus} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className="font-medium tabular-nums">{formatPercent(risk.rate30)}</span>
                  <RiskBadge level={risk.level} />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <EligibilityBadge status={eligibility.status} />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {eligibility.metCount}/{eligibility.total}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {relativeDay(risk.lastAttended ?? '')}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="xs" render={<Link to={`/admin/students/${student.id}`} />}>
                    View
                    <ArrowUpRight />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Record attendance for ${fullName(student)}`}
                    render={<Link to={`/admin/attendance/register?student=${student.id}`} />}
                  >
                    <CalendarCheck />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Notify ${fullName(student)}`}
                    render={<Link to={`/admin/notifications?audience=selected&student=${student.id}`} />}
                  >
                    <Bell />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
