import { useQuery } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { instructorQueryKeys } from '@/lib/instructor/query-keys'

// One grading day with a grading session per target grade, for panel members.
export function useGradingDay(eventId: string | undefined) {
  const { profile, session } = useAuth()
  const api = useInstructorApi()
  const userId = profile?.role === 'instructor' && profile.id === session?.user.id ? profile.id : ''
  return useQuery({
    queryKey: instructorQueryKeys.gradingDay(userId, eventId ?? ''),
    queryFn: ({ signal }) => api.getGradingDay(eventId ?? '', signal),
    enabled: Boolean(userId && eventId),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    retry: false,
  })
}
