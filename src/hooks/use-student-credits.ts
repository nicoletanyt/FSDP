import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { loadStudentCredits } from '@/lib/student-credits'

type CreditState = {
  key: string
  credits: number
  unlimited: boolean
  loading: boolean
  error: string
  payment: 'none' | 'pending' | 'confirmed' | 'delayed'
}

export function useStudentCredits(userId: string | undefined, sessionId: string | null) {
  const key = JSON.stringify([userId, sessionId])
  const initial: CreditState = {
    key, credits: 0, unlimited: false, loading: true, error: '',
    payment: sessionId ? 'pending' : 'none',
  }
  const [state, setState] = useState<CreditState>(initial)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision((previous) => previous + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    setState({ key, credits: 0, unlimited: false, loading: true, error: '', payment: sessionId ? 'pending' : 'none' })

    async function refresh() {
      if (!userId) return
      try {
        const result = await loadStudentCredits(supabase, userId, sessionId, controller.signal)
        if (controller.signal.aborted) return
        attempts++
        const pending = Boolean(sessionId && !result.confirmed)
        setState({
          key, credits: result.credits, unlimited: result.unlimited, loading: false, error: '',
          payment: !sessionId ? 'none' : result.confirmed ? 'confirmed' : attempts < 30 ? 'pending' : 'delayed',
        })
        if (pending && attempts < 30) timer = setTimeout(() => void refresh(), 2000)
      } catch {
        if (!controller.signal.aborted) {
          setState((previous) => ({ ...previous, loading: false, error: 'Unable to load your credits. Please try again.' }))
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
