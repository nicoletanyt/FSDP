import { matchPath, Outlet, useLocation } from 'react-router'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useLiveStudentSchedule } from '@/lib/use-live-student-schedule'

const CREDITS_STORAGE_KEY = 'student_credits'

export default function StudentLayout() {
  const { profile } = useAuth()
  const { pathname } = useLocation()

  const [credits, setCredits] = useState(() => {
    const saved = Number.parseInt(localStorage.getItem(CREDITS_STORAGE_KEY) ?? '0', 10)
    return Number.isNaN(saved) ? 0 : saved
  })

  const addCredits = (amount: number) => {
    setCredits((previous) => {
      const next = previous + amount
      localStorage.setItem(CREDITS_STORAGE_KEY, String(next))
      return next
    })
  }

  const deductCredit = () => {
    if (credits <= 0) return false
    setCredits((previous) => {
      const next = Math.max(previous - 1, 0)
      localStorage.setItem(CREDITS_STORAGE_KEY, String(next))
      return next
    })
    return true
  }

  const creditContext = { credits, addCredits, deductCredit }
  if (!['/timetable', '/classes', '/classes/choose'].some(path => matchPath(path, pathname))) {
    return <Outlet context={creditContext} />
  }
  return <StudentScheduleOutlet key={profile?.id} {...creditContext} />
}

type CreditsContext = {
  credits: number
  addCredits: (amount: number) => void
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
