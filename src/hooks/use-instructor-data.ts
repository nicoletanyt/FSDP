import { useEffect, useState } from 'react'
import { useAuth } from './use-auth'
import { toInstructorDataError } from '@/lib/instructor/errors'

type QueryState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: null; error: string }

export function useInstructorQuery<T>(key: string, load: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const { session, profile } = useAuth()
  const [revision, setRevision] = useState(0)
  const account = profile?.role === 'instructor' ? session?.user.id : null
  const requestKey = JSON.stringify([account, key, revision, enabled])
  const [result, setResult] = useState<{ key: string; value: QueryState<T> } | null>(null)

  useEffect(() => {
    if (!enabled || !account) return
    const controller = new AbortController()
    setResult({ key: requestKey, value: { status: 'loading', data: null, error: null } })
    void Promise.resolve().then(() => load(controller.signal)).then(data => {
      if (!controller.signal.aborted) setResult({ key: requestKey, value: { status: 'success', data, error: null } })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ key: requestKey, value: {
        status: 'error', data: null, error: toInstructorDataError(error, 'Unable to load instructor data. Please try again.').message,
      } })
    })
    return () => controller.abort()
  }, [account, enabled, load, requestKey])

  // Never expose the previous account, date range or selected session while the
  // effect for a new request is still waiting to run.
  const state: QueryState<T> = enabled && account && result?.key === requestKey
    ? result.value : { status: 'loading', data: null, error: null }
  return { ...state, retry: () => setRevision(value => value + 1) }
}
