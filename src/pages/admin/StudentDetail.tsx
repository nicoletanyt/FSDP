import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarCheck, CalendarDays, CircleCheck, CircleX, Mail, Percent } from 'lucide-react'
import { Link, useParams } from 'react-router'
import EmptyState from '@/components/shared/layout/EmptyState'
import PageHeader from '@/components/shared/layout/PageHeader'
import StatCard from '@/components/shared/layout/StatCard'
import { MembershipBadge } from '@/components/shared/status/StatusBadge'
import AttendanceStateBadge from '@/components/shared/status/AttendanceStateBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { formatDate, formatPercent, initials, relativeDay } from '@/lib/admin/format'
import { singaporeDate } from '@/lib/admin/live-class-calendar'
import { rosterAttendance } from '@/lib/instructor/calendar-view'
import type { EventStudentRow } from '@/lib/instructor/types'
import { supabase } from '@/lib/supabase'
import {
  GradingStatus,
  loadStudentDirectory,
  StudentGrade,
  studentDirectoryKey,
  studentName,
  StudentRisk,
} from './LiveStudentsTab'

type RecentClass = {
  id: string
  name: string
  starts_at: string
  centre_id: string
  centres: { name: string } | null
  event_students: Pick<EventStudentRow, 'attendance_status' | 'checked_in_at' | 'recorded_at'>[]
}

async function loadRecentClasses(studentId: string, signal: AbortSignal): Promise<RecentClass[]> {
  const { data, error } = await supabase.from('events')
    .select('id,name,starts_at,centre_id,centres(name),event_students!inner(attendance_status,checked_in_at,recorded_at)')
    .eq('event_students.student_id', studentId).eq('event_type', 'class')
    .lt('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: false }).limit(10).abortSignal(signal)
  if (error) throw error
  return (data ?? []) as unknown as RecentClass[]
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words sm:text-right">{children}</dd>
    </div>
  )
}

export default function StudentDetail() {
  const { studentId = '' } = useParams()
  const { session } = useAuth()
  // Shares the Students page's all-centres directory cache.
  const directory = useQuery({
    queryKey: studentDirectoryKey(session?.user.id, null),
    queryFn: () => loadStudentDirectory(null),
    enabled: Boolean(session),
  })
  const recent = useQuery({
    queryKey: ['admin', session?.user.id, 'student-recent-classes', studentId],
    queryFn: ({ signal }) => loadRecentClasses(studentId, signal),
    enabled: Boolean(session && studentId),
  })
  const student = directory.data?.find(item => item.id === studentId)

  const back = (
    <Button variant="ghost" size="sm" render={<Link to="/admin/students" />}>
      <ArrowLeft />
      All students
    </Button>
  )

  if (directory.isPending) return <p role="status" className="text-sm text-muted-foreground">Loading student…</p>
  if (directory.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
        Unable to load this student.
        <Button variant="outline" size="sm" onClick={() => void directory.refetch()}>Retry</Button>
      </div>
    )
  }
  if (!student) {
    return (
      <EmptyState
        title="Student not found"
        description="This profile may have been removed or the link may be incorrect."
        action={<Button render={<Link to="/admin/students" />}>Back to students</Button>}
      />
    )
  }

  return (
    <div className="space-y-6">
      {back}
      <PageHeader
        title={studentName(student)}
        actions={<>
          <Button variant="outline" render={<a href={`mailto:${student.email}`} />} nativeButton={false}>
            <Mail /> Email
          </Button>
          <Button render={<Link to={`/admin/calendar?centre=${student.home_centre_id}`} />} nativeButton={false}>
            <CalendarCheck /> Calendar
          </Button>
        </>}
      />

      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
              {initials(student.first_name, student.last_name)}
            </span>
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm text-muted-foreground">#{student.member_no} · {student.centre_name}</p>
              <StudentGrade label={student.grade} />
            </div>
          </div>
          <dl className="space-y-4 border-t pt-5 text-sm">
            <Detail label="Email"><span className="break-all">{student.email}</span></Detail>
            <Detail label="Date of birth">{formatDate(student.date_of_birth)}</Detail>
            <Detail label="Membership"><MembershipBadge status={student.membership_status} /></Detail>
            <Detail label="Grading"><GradingStatus status={student.grading_status} /></Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Attendance</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <StatCard label="Attendance rate" icon={Percent}
              value={student.attendance_rate === null ? '—' : formatPercent(student.attendance_rate)} />
            <StatCard label="Attended" icon={CircleCheck} tone="success" value={String(student.attended)} />
            <StatCard label="Missed" icon={CircleX} tone={student.missed ? 'danger' : 'default'} value={String(student.missed)} />
            <StatCard label="Last attended" icon={CalendarDays}
              value={student.last_attended ? relativeDay(student.last_attended) : '—'} />
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Risk</span>
            <StudentRisk level={student.risk_level} />
          </div>
          <div className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-medium">Recent classes</h3>
            {recent.isPending && <p role="status" className="text-sm text-muted-foreground">Loading classes…</p>}
            {recent.isError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
              Unable to load recent classes.
              <Button variant="outline" size="sm" onClick={() => void recent.refetch()}>Retry</Button>
            </div>}
            {recent.isSuccess && !recent.data.length && <p className="text-sm text-muted-foreground">No classes yet.</p>}
            {recent.isSuccess && recent.data.length > 0 && (
              <ul className="divide-y divide-border/50 rounded-lg border">
                {recent.data.map(item => {
                  const record = item.event_students[0]
                  const attendance = rosterAttendance(record as EventStudentRow, item.starts_at)
                  const date = singaporeDate(new Date(item.starts_at))
                  return (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-1">
                      <Link
                        to={`/admin/calendar?centre=${item.centre_id}&date=${date}&view=day&session=${item.id}:${date}`}
                        className="min-w-0 rounded-sm py-1.5 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        <span className="block truncate text-sm font-medium">{item.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(date)} · {item.centres?.name ?? 'Unknown dojo'}
                        </span>
                      </Link>
                      <AttendanceStateBadge name={studentName(student)} value={attendance} />
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
