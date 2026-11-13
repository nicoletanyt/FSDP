import { Outlet, useSearchParams } from 'react-router'
import { useMemo } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { getOfferings } from '@/lib/student-schedule'
import { useStudentEnrollments } from '@/lib/student-enrolments'
import { useStudentCredits } from '@/hooks/use-student-credits'

export default function StudentLayout() {
  const { profile } = useAuth()
  const classes = useMemo(() => getOfferings(), [])
  const schedule = useStudentEnrollments(profile?.id ?? 'unknown', classes)

  const [params] = useSearchParams()
  const sessionId = params.get('checkout') === 'success' ? params.get('session_id') : null
  const creditAccount = useStudentCredits(profile?.id, sessionId)

  return <Outlet context={{ classes, schedule, credits: creditAccount.credits, creditAccount }} />
}

export type StudentContext = {
  classes: ReturnType<typeof getOfferings>
  schedule: ReturnType<typeof useStudentEnrollments>
  credits: number
  creditAccount: ReturnType<typeof useStudentCredits>
}
