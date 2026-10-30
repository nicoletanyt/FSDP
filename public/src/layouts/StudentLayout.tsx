import { Outlet } from 'react-router'
import { useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import StudentNavigation from '@/components/student/StudentNavigation'
import { getOfferings } from '@/lib/student-schedule'
import { useStudentEnrollments } from '@/lib/student-enrolments'

export default function StudentLayout() {
  const { profile } = useAuth()
  const classes = useMemo(() => getOfferings(), [])
  const schedule = useStudentEnrollments(profile?.id ?? 'unknown', classes)
  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm font-medium text-primary">Student portal</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Aikido Shinju-Kai</h1><p className="mt-2 text-sm text-muted-foreground">Welcome back, {profile?.first_name || 'student'}.</p></div>
      <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Demo class schedule · saved on this device</span>
    </div>
    <StudentNavigation />
    <Outlet context={{ classes, schedule }} />
  </section>
}
export type StudentContext = { classes: ReturnType<typeof getOfferings>; schedule: ReturnType<typeof useStudentEnrollments> }
