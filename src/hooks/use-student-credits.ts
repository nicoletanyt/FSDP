import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { creditLoadErrorMessage, loadStudentCredits } from '@/lib/student-credits'
import { studentQueryKeys as keys, studentQueryTimes as times } from '@/lib/student/query-keys'

// Stop fast-polling an unconfirmed checkout after this many reads.
const CONFIRMATION_ATTEMPTS = 30

export function useStudentCredits(userId: string | undefined, sessionId: string | null) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: keys.credits(userId ?? '', sessionId),
    queryFn: ({ signal }) => loadStudentCredits(supabase, userId!, sessionId, signal),
    ...times.credits,
    enabled: Boolean(userId),
    // Re-render on every read, even an unchanged one, so the attempt count below advances.
    notifyOnChangeProps: ['data', 'error', 'isError', 'dataUpdatedAt'],
    // Continue reconciling expirations while the page remains open, and poll
    // quickly while a returned checkout is still unconfirmed.
    refetchInterval: (current) => {
      const pending = Boolean(sessionId && current.state.data && !current.state.data.confirmed)
      return pending && current.state.dataUpdateCount < CONFIRMATION_ATTEMPTS ? 2000 : 60_000
    },
  })
  // Every mounted copy (the layout's and the navbar's) shares the credits prefix.
  const retry = useCallback(() => {
    if (userId) void client.invalidateQueries({ queryKey: keys.creditsAll(userId) })
  }, [client, userId])

  const data = query.data
  // Each data update re-renders this hook, so reading the count here stays current.
  const reads = client.getQueryState(keys.credits(userId ?? '', sessionId))?.dataUpdateCount ?? 0
  const payment: 'none' | 'pending' | 'confirmed' | 'delayed' = !sessionId ? 'none'
    : data?.confirmed ? 'confirmed'
      : reads < CONFIRMATION_ATTEMPTS ? 'pending' : 'delayed'
  return {
    credits: data?.credits ?? 0,
    unlimited: data?.unlimited ?? false,
    expiring: data?.expiring ?? null,
    loading: Boolean(userId) && data === undefined && !query.isError,
    error: query.isError ? creditLoadErrorMessage(query.error) : '',
    payment,
    retry,
  }
}
