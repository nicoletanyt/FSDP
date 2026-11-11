import { QueryClient } from '@tanstack/react-query'

export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (error && typeof error === 'object') {
    const status = 'status' in error ? error.status : undefined
    const code = 'code' in error ? error.code : undefined
    const name = 'name' in error ? error.name : undefined
    if (status === 401 || status === 403 || status === '401' || status === '403'
        || code === 'unauthenticated' || code === 'forbidden' || code === '42501'
        || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303'
        || name === 'AuthSessionMissingError') return false
  }
  return failureCount < 1
}

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: shouldRetryQuery,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  })
}
