import { matchPath, Outlet, useLocation, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
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
  const creditContext = { credits: creditAccount.credits, creditAccount }
  if (!['/timetable', '/classes', '/classes/choose'].some(path => matchPath(path, pathname))) {
    return <Outlet context={creditContext} />
  }
  return <StudentScheduleOutlet key={profile?.id} {...creditContext} />
}

type CreditsContext = {
  credits: number
  creditAccount: ReturnType<typeof useStudentCredits>
}

function StudentScheduleOutlet(creditContext: CreditsContext) {
  const schedule = useLiveStudentSchedule(creditContext.creditAccount.retry)
  if (schedule.loading) return <p role="status" className="text-sm text-muted-foreground">Loading class schedule…</p>
  if (schedule.error) return (
    <div role="alert" className="space-y-3">
      <p>{schedule.error}</p>
      <Button variant="outline" onClick={schedule.retry}>Try again</Button>
    </div>
  )
  return <Outlet context={{ ...creditContext, classes: schedule.classes, schedule }} />
}

export type StudentContext = CreditsContext & {
  classes: ReturnType<typeof useLiveStudentSchedule>['classes']
  schedule: ReturnType<typeof useLiveStudentSchedule>
}
