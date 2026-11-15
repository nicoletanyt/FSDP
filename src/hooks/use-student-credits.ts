import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { creditLoadErrorMessage, loadStudentCredits } from '@/lib/student-credits'
import type { ExpiringCredits } from '@/lib/student-credits'

type CreditState = {
  key: string
  credits: number
  unlimited: boolean
  expiring: ExpiringCredits | null
  loading: boolean
  error: string
  payment: 'none' | 'pending' | 'confirmed' | 'delayed'
}

export function useStudentCredits(userId: string | undefined, sessionId: string | null) {
  const key = JSON.stringify([userId, sessionId])
  const initial: CreditState = {
    key, credits: 0, unlimited: false, expiring: null, loading: Boolean(userId), error: '',
    payment: sessionId ? 'pending' : 'none',
  }
  const [state, setState] = useState<CreditState>(initial)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision((previous) => previous + 1), [])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') retry() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [retry])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    setState({ key, credits: 0, unlimited: false, expiring: null, loading: Boolean(userId), error: '', payment: sessionId ? 'pending' : 'none' })

    async function refresh() {
      if (!userId) return
      try {
        const result = await loadStudentCredits(supabase, userId, sessionId, controller.signal)
        if (controller.signal.aborted) return
        attempts++
        const pending = Boolean(sessionId && !result.confirmed)
        setState({
          key, credits: result.credits, unlimited: result.unlimited, expiring: result.expiring, loading: false, error: '',
          payment: !sessionId ? 'none' : result.confirmed ? 'confirmed' : attempts < 30 ? 'pending' : 'delayed',
        })
        // Continue reconciling expirations while the dashboard remains open.
        timer = setTimeout(() => void refresh(), pending && attempts < 30 ? 2000 : 60_000)
      } catch (failure) {
        if (!controller.signal.aborted) {
          setState((previous) => ({ ...previous, loading: false, error: creditLoadErrorMessage(failure) }))
        }
      }
    }

    void refresh()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [key, userId, sessionId, revision])

  return { ...(state.key === key ? state : initial), retry }
}
