import type { QueryKey, UseQueryOptions } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useClassQuery } from './use-instructor-class-queries'

export type QueryState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: string }

export function useInstructorQuery<T>(key: (userId: string) => QueryKey,
  load: (signal: AbortSignal) => Promise<T>, options: {
    enabled?: boolean; staleTime: number; gcTime: number; retainDuringWrite?: boolean
    placeholderData?: UseQueryOptions<T, Error, T, QueryKey>['placeholderData']
  }) {
  const { session, profile } = useAuth()
  const userId = profile?.role === 'instructor' ? session?.user.id : undefined
  return useClassQuery(key(userId ?? ''), load, { ...options, enabled: Boolean(userId && options.enabled !== false) })
}
