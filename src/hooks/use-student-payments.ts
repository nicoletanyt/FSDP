import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { loadStudentPayments } from '@/lib/student-payments'
import { studentQueryKeys as keys, studentQueryTimes as times } from '@/lib/student/query-keys'

export function useStudentPayments(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.payments(userId ?? ''),
    queryFn: ({ signal }) => loadStudentPayments(supabase, userId!, signal),
    ...times.account,
    enabled: Boolean(userId),
  })
  const loading = Boolean(userId) && query.data === undefined && (query.isPending || query.isFetching)
  return {
    payments: query.data ?? [],
    loading,
    error: query.data === undefined && !loading && query.isError ? 'Unable to load your payments. Please try again.' : '',
    retry: () => { void query.refetch() },
  }
}
