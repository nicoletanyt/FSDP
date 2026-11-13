import { useQuery } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { instructorQueryKeys } from '@/lib/instructor/query-keys'

// Grading sessions the signed-in instructor examines. Empty for instructors on
// no panel, which also hides the Gradings navigation item.
export function useMyGradingPanels() {
  const { profile, session } = useAuth()
  const api = useInstructorApi()
  const userId = profile?.role === 'instructor' && profile.id === session?.user.id ? profile.id : ''
  return useQuery({
    queryKey: instructorQueryKeys.gradingPanels(userId),
    queryFn: ({ signal }) => api.getMyGradingPanels(signal),
    enabled: Boolean(userId),
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
  })
}
