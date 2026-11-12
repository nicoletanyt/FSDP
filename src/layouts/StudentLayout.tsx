import { Outlet } from 'react-router'
import { useMemo, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { getOfferings } from '@/lib/student-schedule'
import { useStudentEnrollments } from '@/lib/student-enrolments'

const CREDITS_STORAGE_KEY = 'student_credits'

export default function StudentLayout() {
  const { profile } = useAuth()
  const classes = useMemo(() => getOfferings(), [])
  const schedule = useStudentEnrollments(profile?.id ?? 'unknown', classes)

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

  return <Outlet context={{ classes, schedule, credits, addCredits, deductCredit }} />
}

export type StudentContext = {
  classes: ReturnType<typeof getOfferings>
  schedule: ReturnType<typeof useStudentEnrollments>
  credits: number
  addCredits: (amount: number) => void
  deductCredit: () => boolean
}
