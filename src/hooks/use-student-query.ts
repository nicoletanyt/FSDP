import { useQuery } from '@tanstack/react-query'
import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'
import { useAuth } from './use-auth'

type Options<T> = Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn' | 'enabled'> & {
  enabled?: boolean
  staleTime: number
  gcTime: number
}

/** The signed-in user's ID, used to scope every student query key. */
export function useStudentUserId() {
  return useAuth().session?.user.id
}

/**
 * Student-side counterpart of useInstructorQuery: the key is scoped by the
 * authenticated user, and the query only runs while someone is signed in.
 * Callers treat `data === undefined` as loading, so background refetches keep
 * showing the cached data instead of a skeleton.
 */
export function useStudentQuery<T>(key: (userId: string) => QueryKey,
  load: (userId: string, signal: AbortSignal) => Promise<T>, options: Options<T>) {
  const userId = useStudentUserId()
  const { enabled, ...rest } = options
  return useQuery({
    ...rest,
    queryKey: key(userId ?? ''),
    queryFn: ({ signal }) => load(userId!, signal),
    enabled: Boolean(userId && enabled !== false),
  })
}
