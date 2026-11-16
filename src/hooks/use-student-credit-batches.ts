import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { loadStudentCreditBatches } from '@/lib/student-credit-batches'
import { studentQueryKeys as keys, studentQueryTimes as times } from '@/lib/student/query-keys'

export function useStudentCreditBatches(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.creditBatches(userId ?? ''),
    queryFn: ({ signal }) => loadStudentCreditBatches(supabase, userId!, signal),
    ...times.account,
    enabled: Boolean(userId),
    // Batches expire over time, so keep reconciling while the list is open.
    refetchInterval: 60_000,
  })
  const loading = Boolean(userId) && query.data === undefined && (query.isPending || query.isFetching)
  return {
    batches: query.data ?? [],
    loading,
    error: query.data === undefined && !loading && query.isError ? 'Unable to load your passes. Please try again.' : '',
    retry: () => { void query.refetch() },
  }
}
