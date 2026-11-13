import { useQuery } from '@tanstack/react-query'
import { matchPath, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useLiveStudentSchedule } from '@/lib/use-live-student-schedule'
import { supabase } from '@/lib/supabase'

export default function StudentLayout() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const balance = useQuery({
    queryKey: ['student-credit-account', profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.from('credit_accounts').select('credits, unlimited, active').eq('user_id', profile?.id ?? '').abortSignal(signal).maybeSingle<CreditAccount>()
      if (error) throw error
      return data ?? { credits: 0, unlimited: false, active: true }
    }
  })
  const creditContext = {
    creditAccount: balance.data,
    creditError: balance.isError,
    refreshCredits: balance.refetch
  }

  if (!['/timetable', '/classes', '/classes/choose'].some(path => matchPath(path, pathname))) {
    return <Outlet context={creditContext} />
  }
  return <StudentScheduleOutlet key={profile?.id} {...creditContext} />
}

type CreditAccount = {
  credits: number
  unlimited: boolean
  active: boolean
}

type CreditsContext = {
  creditAccount: CreditAccount | undefined
  creditError: boolean
  refreshCredits: () => Promise<unknown>
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
