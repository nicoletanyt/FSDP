import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { loadStudentMembership } from '@/lib/student-membership'
import { studentQueryKeys as keys, studentQueryTimes as times } from '@/lib/student/query-keys'

export function useStudentMembership(userId: string | undefined) {
  const query = useQuery({
    queryKey: keys.membershipDetails(userId ?? ''),
    queryFn: ({ signal }) => loadStudentMembership(supabase, userId!, signal),
    ...times.account,
    enabled: Boolean(userId),
    // The expiry date changes on its own, so reconcile it while the page is open.
    refetchInterval: 60_000,
  })
  const loading = Boolean(userId) && query.data === undefined && (query.isPending || query.isFetching)
  return {
    membership: query.data,
    loading,
    error:
      query.data === undefined && !loading && query.isError
        ? 'Unable to load your membership. Please try again.'
        : '',
    retry: () => {
      void query.refetch()
    },
  }
}
