import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { loadDashboardGrading } from '@/lib/dashboard-grading'
import { studentQueryKeys as keys, studentQueryTimes as times } from '@/lib/student/query-keys'

export function useDashboardGrading(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.dashboardGrading(userId ?? ''),
    queryFn: ({ signal }) => loadDashboardGrading(supabase, userId!, signal),
    ...times.account,
    enabled: Boolean(userId),
  })
  if (!userId) return { status: 'Sign in to view applications', badge: 0, loading: false }
  if (query.data) return { ...query.data, loading: false }
  if (query.isError) return { status: 'Status unavailable — view applications', badge: 0, loading: false }
  return { status: 'Loading applications…', badge: 0, loading: true }
}
