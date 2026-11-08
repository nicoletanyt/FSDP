import { useQuery } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { instructorQueryKeys } from '@/lib/instructor/query-keys'

export function useInstructorProfile() {
  const { profile, session } = useAuth()
  const api = useInstructorApi()
  const userId = profile?.role === 'instructor' && profile.id === session?.user.id ? profile.id : ''
  return useQuery({
    queryKey: instructorQueryKeys.profile(userId),
    queryFn: ({ signal }) => api.getProfile(userId, signal),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    // Private image URLs expire after an hour; refresh while the app stays open.
    refetchInterval: 45 * 60_000,
  })
}
