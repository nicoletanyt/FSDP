import { Outlet } from 'react-router'
import { useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { getOfferings } from '@/lib/student-schedule'
import { useStudentEnrollments } from '@/lib/student-enrolments'

export default function StudentLayout() {
  const { profile } = useAuth()
  const classes = useMemo(() => getOfferings(), [])
  const schedule = useStudentEnrollments(profile?.id ?? 'unknown', classes)
  return <Outlet context={{ classes, schedule }} />
}
export type StudentContext = { classes: ReturnType<typeof getOfferings>; schedule: ReturnType<typeof useStudentEnrollments> }
