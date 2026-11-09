import { matchPath, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useLiveStudentSchedule } from '@/lib/use-live-student-schedule'

export default function StudentLayout() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  if (!['/attendance', '/classes', '/timetable'].some(path => matchPath(path, pathname))) return <Outlet />
  return <StudentScheduleOutlet key={profile?.id} />
}

function StudentScheduleOutlet() {
  const schedule = useLiveStudentSchedule()
  if (schedule.loading) return <p role="status" className="text-sm text-muted-foreground">Loading class schedule…</p>
  if (schedule.error) return (
    <div role="alert" className="space-y-3">
      <p>{schedule.error}</p>
      <Button variant="outline" onClick={schedule.retry}>Try again</Button>
    </div>
  )
  return <>
    {!schedule.linked && <p role="status" className="mb-4 rounded-lg border bg-muted p-3 text-sm">
      Your account is not linked to a student membership. Contact staff to access your bookings and attendance.
    </p>}
    <Outlet context={{ classes: schedule.classes, schedule }} />
  </>
}

export type StudentContext = { classes: ReturnType<typeof useLiveStudentSchedule>['classes']; schedule: ReturnType<typeof useLiveStudentSchedule> }
