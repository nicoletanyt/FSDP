import { matchPath, Outlet, useLocation, useSearchParams } from 'react-router'
import { useState } from 'react'
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
  // Preserve the booking flow's in-session deductions without writing a
  // browser-controlled balance back to the database-backed credit account.
  const creditKey = JSON.stringify([profile?.id, creditAccount.credits])
  const [spent, setSpent] = useState({ key: creditKey, amount: 0 })
  const credits = Math.max(0, creditAccount.credits - (spent.key === creditKey ? spent.amount : 0))
  const deductCredit = () => {
    if (creditAccount.unlimited) return true
    if (credits <= 0) return false
    setSpent(previous => ({ key: creditKey, amount: (previous.key === creditKey ? previous.amount : 0) + 1 }))
    return true
  }

  const creditContext = { credits, creditAccount: { ...creditAccount, credits }, deductCredit }
  if (!['/timetable', '/classes', '/classes/choose'].some(path => matchPath(path, pathname))) {
    return <Outlet context={creditContext} />
  }
  return <StudentScheduleOutlet key={profile?.id} {...creditContext} />
}

type CreditsContext = {
  credits: number
  creditAccount: ReturnType<typeof useStudentCredits>
  deductCredit: () => boolean
}

function StudentScheduleOutlet(creditContext: CreditsContext) {
  const schedule = useLiveStudentSchedule()
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
