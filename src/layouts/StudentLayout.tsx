import { matchPath, Outlet, useLocation, useSearchParams } from 'react-router'
import RetryAlert from '@/components/shared/layout/RetryAlert'
import { StudentRouteSkeleton } from '@/components/student/StudentSkeletons'
import { useAuth } from '@/hooks/use-auth'
import { useLiveStudentSchedule } from '@/lib/use-live-student-schedule'
import { useStudentCredits } from '@/hooks/use-student-credits'

export default function StudentLayout() {
  const { profile } = useAuth()
  const { pathname } = useLocation()

  const [params] = useSearchParams()
  const sessionId = params.get('checkout') === 'success' ? params.get('session_id') : null
  const creditAccount = useStudentCredits(profile?.id, sessionId)
  // Booking RPCs debit/refund batches in the same transaction as the class seat.
  // Never simulate a separate browser deduction on top of that committed debit.
  const creditContext = {
    credits: creditAccount.credits,
    creditAccount,
    creditError: Boolean(creditAccount.error),
    refreshCredits: async () => creditAccount.retry(),
  }
  if (!['/timetable', '/classes', '/classes/choose'].some(path => matchPath(path, pathname))) {
    return <Outlet context={creditContext} />
  }
  // Schedule keys are user-scoped, so remounting per user is unnecessary.
  return <StudentScheduleOutlet {...creditContext} />
}

type CreditsContext = {
  credits: number
  creditAccount: ReturnType<typeof useStudentCredits>
  creditError: boolean
  refreshCredits: () => Promise<unknown>
}

function StudentScheduleOutlet(creditContext: CreditsContext) {
  // Booking changes invalidate the cached credit queries themselves.
  const schedule = useLiveStudentSchedule()
  if (schedule.loading) return <StudentRouteSkeleton label="Loading class schedule…" />
  if (schedule.error) return <RetryAlert message={schedule.error} onRetry={schedule.retry} />
  return <Outlet context={{ ...creditContext, classes: schedule.classes, schedule }} />
}

export type StudentContext = CreditsContext & {
  classes: ReturnType<typeof useLiveStudentSchedule>['classes']
  schedule: ReturnType<typeof useLiveStudentSchedule>
}
