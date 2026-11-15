import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { CreditCard, GraduationCap, Loader2, ShieldCheck } from 'lucide-react'
import BackLink from '@/components/shared/layout/BackLink'
import PageHeader from '@/components/shared/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useAuth } from '@/hooks/use-auth'
import { money } from '@/lib/format'
import { gradingDate } from '@/lib/grading/format'
import { getGradingQuote, getGradingCheckoutUrl, type GradingQuote } from '@/lib/grading-checkout'
import type { GradingPaymentLocationState } from '@/lib/grading-payment'

// Dates arrive as YYYY-MM-DD; anything else is shown as given.
const readableDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? gradingDate(value) : value

export default function GradingPayment() {
  const location = useLocation()
  const state = (location.state ?? {}) as GradingPaymentLocationState
  const { profile } = useAuth()
  const [quote, setQuote] = useState<GradingQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const submitting = useRef(false)
  const eventId = state.gradingEventId
  const gradeId = state.targetGradeId
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')

  useEffect(() => {
    let active = true
    setQuote(null)
    setError('')
    setLoading(true)
    if (!eventId || !gradeId) {
      setLoading(false)
      return
    }
    void getGradingQuote(eventId, gradeId)
      .then((result) => { if (active) setQuote(result) })
      .catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Unable to load grading fee.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [eventId, gradeId, profile?.id, revision])

  async function pay() {
    if (!quote || submitting.current) return
    submitting.current = true
    setProcessing(true)
    setError('')
    try {
      window.location.assign(await getGradingCheckoutUrl(quote))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to open Stripe checkout.')
      // Always obtain a fresh authoritative quote before allowing another click.
      try { setQuote(await getGradingQuote(eventId!, gradeId!)) } catch { setQuote(null) }
      submitting.current = false
      setProcessing(false)
    }
  }

  return (
    <section className="w-full max-w-3xl">
      <BackLink to="/grading/applications">Back to grading applications</BackLink>
      <div className="mb-6">
        <PageHeader
          title="Complete your grading payment"
          description="Review your total, then pay securely on Stripe. Your application is submitted only after payment is verified."
        />
      </div>

      {!eventId || !gradeId ? <Card className="p-6">
        <p>Select an eligible grading session before making payment.</p>
        <Link to="/grading/applications" className="text-primary underline underline-offset-4">Choose a grading session</Link>
      </Card> : <Card className="gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b p-5 sm:p-6">
          <GraduationCap className="size-6 shrink-0 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Grading payment summary</h2>
        </div>
        <div className="p-5 sm:p-6">
          {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Checking your grading fee…</p>}
          {quote && <>
            {state.expectedTotalCents !== undefined && state.expectedTotalCents !== quote.totalCents && <p role="status" className="mb-5 rounded-lg bg-muted p-3 text-sm">The fee has been updated for this session. Please review the total below before paying.</p>}
            <dl className="space-y-4 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Applicant</dt><dd className="font-medium">{name}</dd></div>
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Target grade</dt><dd className="font-medium">{quote.gradeLabel}</dd></div>
              {state.gradingDate && <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Grading date</dt><dd>{readableDate(state.gradingDate)}</dd></div>}
              <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Application closing date</dt><dd>{readableDate(quote.applicationDeadline)} · Singapore time</dd></div>
              <div className="flex justify-between gap-3 border-t pt-4"><dt className="text-muted-foreground">Grading examination fee</dt><dd className="font-medium tabular-nums">{money.format(quote.baseFeeCents / 100)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Late submission charge</dt><dd className="font-medium tabular-nums">{money.format(quote.lateFeeCents / 100)}</dd></div>
              <div className="flex items-baseline justify-between gap-3 border-t pt-4"><dt className="font-semibold">Total due</dt><dd data-testid="grading-total" className="text-3xl font-bold tabular-nums">{money.format(quote.totalCents / 100)}</dd></div>
            </dl>
            {quote.lateFeeCents > 0 && <p className="mt-4 text-sm text-muted-foreground">This session is still open for late applications. Your total includes the {money.format(quote.lateFeeCents / 100)} late submission charge.</p>}
          </>}
          {error && <div role="alert" className="mt-4 text-sm text-destructive">{error} {!quote && !processing && <button type="button" className="ml-2 rounded underline underline-offset-4" onClick={() => setRevision((previous) => previous + 1)}>Review fee again</button>}</div>}
          <Button type="button" size="lg" className="mt-6 w-full" disabled={loading || processing || !quote} onClick={() => void pay()}>
            {processing ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Redirecting to Stripe…</> : <><CreditCard className="size-4" aria-hidden="true" /> Pay {quote ? money.format(quote.totalCents / 100) : ''} with Stripe</>}
          </Button>
          <p className="mt-4 flex items-start justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 shrink-0" aria-hidden="true" /> All prices are in SGD. Payment details are entered on Stripe, not on this website.</p>
        </div>
      </Card>}
    </section>
  )
}
