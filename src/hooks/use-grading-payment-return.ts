import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { gradingCheckoutRequest } from '@/lib/grading-checkout'

type PaymentState = { key: string; status: 'pending' | 'confirmed' | 'delayed' | 'error'; message: string }

export function useGradingPaymentReturn(userId: string | undefined) {
  const [params] = useSearchParams()
  const outcome = params.get('grading_checkout')
  const sessionId = params.get('session_id')
  const isReturn = outcome === 'success' || outcome === 'test-success'
  const key = JSON.stringify([userId, outcome, sessionId])
  const [state, setState] = useState<PaymentState | null>(null)
  const [revision, setRevision] = useState(0)
  const pending: PaymentState = { key, status: 'pending', message: 'Confirming your grading payment and saving your application…' }

  useEffect(() => {
    if (!isReturn || !userId) return
    if (!sessionId || !/^cs_test_[A-Za-z0-9_]+$/.test(sessionId)) {
      setState({ key, status: 'error', message: 'Unable to identify this grading payment. View your applications or contact your dojo; do not pay again.' })
      return
    }
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    setState(pending)
    async function check() {
      try {
        const result = await gradingCheckoutRequest<{ paid: boolean; paymentRecorded?: boolean }>({
          action: outcome === 'test-success' ? 'test-status' : 'status', session_id: sessionId,
        })
        if (!active) return
        if (result.paid && result.paymentRecorded) {
          setState({ key, status: 'confirmed', message: outcome === 'test-success'
            ? 'Sandbox payment confirmed and recorded. Your grading request is saved and awaiting dojo review. No real charge was made.'
            : 'Payment confirmed. Your grading application has been saved. View Grading Applications below to track its progress.' })
        } else if (++attempts < 30) {
          timer = setTimeout(() => void check(), 2000)
        } else {
          setState({ key, status: 'delayed', message: 'Grading payment confirmation is taking longer than expected. Check again shortly; do not pay again.' })
        }
      } catch {
        if (active) setState({ key, status: 'error', message: 'Unable to verify your grading payment. Check again or contact your dojo; do not pay again.' })
      }
    }
    void check()
    return () => { active = false; clearTimeout(timer) }
  }, [userId, outcome, sessionId, key, revision])

  return {
    payment: isReturn && userId ? state?.key === key ? state : pending : null,
    retry: () => setRevision(previous => previous + 1),
  }
}
