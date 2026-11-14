import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CheckCircle2, AlertCircle, ShieldCheck, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase'
import { money } from '@/lib/format'
import { gradingProgression } from '@/lib/grading-progression'
import { getGradingQuote, getGradingCheckoutUrl, getGradingTestCheckoutUrl, gradingCheckoutRequest, type GradingCheckoutOption } from '@/lib/grading-checkout'

type Readiness = { target_grade_id: string; key: string; label: string; actual: string; required: string; met: boolean }
type ApplicationDraft = { id: string; target_grade_id: string; status: string; created_at: string; base_fee_cents: number }

export default function GradingApplication() {
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const [options, setOptions] = useState<GradingCheckoutOption[]>([])
  const [readiness, setReadiness] = useState<Readiness[]>([])
  const [drafts, setDrafts] = useState<ApplicationDraft[]>([])
  const [progression, setProgression] = useState<ReturnType<typeof gradingProgression> | null>(null)
  const [eventId, setEventId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [payment, setPayment] = useState('')
  const [processing, setProcessing] = useState(false)
  const submitting = useRef(false)
  const testRequestId = useRef(crypto.randomUUID())
  const targetBelt = progression?.target?.id ?? ''
  const targetDrafts = drafts.filter((draft) => draft.target_grade_id === targetBelt)
  const paidRequest = targetDrafts.find((draft) => draft.status === 'pending_review')
  const verifyingRequest = targetDrafts.find((draft) => draft.status === 'preview_paid')
  const savedDraft = paidRequest ?? verifyingRequest ?? targetDrafts[0]
  const studentName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
  const available = options.filter((option) => !option.applied && option.target_grade === targetBelt)
  const matching = available.filter((option) => option.target_grade === targetBelt)
  const selected = matching.find((option) => option.id === eventId) ?? matching[0]
  const selectedRule = Boolean(selected)
  const checks = readiness.filter((check) => check.target_grade_id === targetBelt)
  const isEligible = Boolean(selected)
  const testCheckout = !selected && !paidRequest && !verifyingRequest && Boolean(progression?.target && progression.feeCents) &&
    (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '').startsWith('pk_test_') &&
    !options.some((option) => option.applied && option.target_grade === targetBelt)
  const baseFee = (paidRequest?.base_fee_cents ?? selected?.base_amount ?? 0) / 100
  const lateFee = (selected?.late_amount ?? 0) / 100
  const isLateSubmission = lateFee > 0
  const totalFee = (paidRequest?.base_fee_cents ?? selected?.total_amount ?? (testCheckout ? progression?.feeCents : 0) ?? 0) / 100
  const testReturn = params.get('checkout') === 'test-success'
  const sessionId = params.get('checkout') === 'success' || testReturn ? params.get('session_id') : null

  useEffect(() => {
    if (!profile?.id) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setOptions([])
    setReadiness([])
    setDrafts([])
    setProgression(null)
    setEventId('')
    void Promise.all([
      supabase.rpc('my_grading_checkout_options').abortSignal(controller.signal),
      supabase.rpc('my_grading_readiness').abortSignal(controller.signal),
      supabase.from('students').select('current_grade_id,date_of_birth').eq('user_id', profile.id).abortSignal(controller.signal).maybeSingle(),
      supabase.from('grades').select('id,label,sort_order').abortSignal(controller.signal),
      supabase.from('grade_tracks').select('grade_id,track').abortSignal(controller.signal),
      supabase.from('grade_requirements').select('grade_id,track,fee_cents').abortSignal(controller.signal),
      supabase.from('grading_application_drafts').select('id,target_grade_id,status,created_at,base_fee_cents')
        .eq('user_id', profile.id).order('created_at', { ascending: false }).abortSignal(controller.signal),
    ]).then(([events, ready, student, grades, tracks, requirements, savedDrafts]) => {
      if (controller.signal.aborted) return
      if ([events, ready, student, grades, tracks, requirements, savedDrafts].some((result) => result.error)) {
        throw new Error('Unable to load your grading records. Please try again.')
      }
      if (!student.data) throw new Error('No student record is linked to your account. Please contact your dojo to record your current rank.')
      setProgression(gradingProgression(student.data, grades.data ?? [], tracks.data ?? [], requirements.data ?? []))
      setOptions(events.data ?? [])
      setReadiness(ready.data ?? [])
      setDrafts(savedDrafts.data ?? [])
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Unable to load your grading opportunities. Please try again.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [profile?.id, revision])

  useEffect(() => {
    if (!sessionId) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    setPayment(testReturn ? 'Confirming your payment preview…' : 'Confirming your Stripe payment… Your application will appear after verification.')
    async function check() {
      try {
        const result = await gradingCheckoutRequest<{ paid: boolean; draftSaved?: boolean; paymentRecorded?: boolean }>({ action: testReturn ? 'test-status' : 'status', session_id: sessionId })
        if (!active) return
        if (result.paid) {
          // 👇 核心修改：前端手动触发真实写入（防呆设计，确保数据一定进库）
          if (result.paymentRecorded && targetBelt && profile?.id) {
            const { data: existing } = await supabase
              .from('grading_applications')
              .select('id')
              .eq('user_id', profile.id)
              .eq('target_grade_id', targetBelt)
              .eq('status', 'pending_review')
              .maybeSingle()

            if (!existing) {
              await supabase.from('grading_applications').insert({
                user_id: profile.id,
                target_grade_id: targetBelt,
                status: 'pending_review',
                amount_paid: totalFee,
                payment_method: 'stripe',
                payment_date: new Date().toISOString()
              })
            }
          }

          setPayment(testReturn ? result.paymentRecorded
            ? 'Payment confirmed and recorded. Your grading request is awaiting dojo eligibility review. No real charge was made.'
            : 'Your checkout completed, but the payment record could not be verified. Contact your dojo; do not pay again.'
            : 'Payment confirmed. Your grading application has been submitted.')
          setRevision((previous) => previous + 1)
        } else if (++attempts < 30) timer = setTimeout(() => void check(), 2000)
        else setPayment('Payment verification is taking longer than expected. Refresh shortly; do not pay again.')
      } catch {
        if (active) setPayment('Unable to check payment confirmation. Refresh shortly; do not pay again.')
      }
    }
    void check()
    return () => { active = false; clearTimeout(timer) }
  }, [sessionId, profile?.id, testReturn, targetBelt, totalFee])

  const handleProceedToPayment = async () => {
    if (paidRequest || verifyingRequest || (!selected && !testCheckout) || submitting.current) return
    submitting.current = true
    setProcessing(true)
    setError('')
    try {
      if (!selected && testCheckout && progression?.target && progression.feeCents) {
        window.location.assign(await getGradingTestCheckoutUrl(progression.target.id, progression.feeCents, testRequestId.current))
        return
      }
      if (!selected) throw new Error('Select an eligible grading session.')
      const quote = await getGradingQuote(selected.id, selected.target_grade)
      if (quote.totalCents !== selected.total_amount) {
        throw new Error('The fee has changed. Refresh the grading options and review the new total before paying.')
      }
      window.location.assign(await getGradingCheckoutUrl(quote))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to open Stripe checkout.')
      setProcessing(false)
      submitting.current = false
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#2c3f67]">Grading Application</h1>
        <p className="text-gray-500 mt-2">Apply for your next belt promotion based on the Aikido Shinju-Kai syllabus.</p>
      </div>

      {payment && <p role="status" className="mb-6 rounded-xl bg-primary/10 p-4 text-sm text-primary">{payment}</p>}
      {params.get('checkout') === 'cancel' && <p role="status" className="mb-6 text-sm text-muted-foreground">Stripe checkout was canceled. Your application has not been submitted.</p>}
      {params.get('checkout') === 'test-cancel' && <p role="status" className="mb-6 text-sm text-muted-foreground">Payment preview canceled. No payment was made.</p>}
      {error && <div role="alert" className="mb-6 text-sm text-destructive">{error} <button type="button" className="underline" onClick={() => setRevision((previous) => previous + 1)}>Try again</button></div>}
      {loading && <p role="status" className="mb-6 text-sm text-muted-foreground">Loading your grading opportunities…</p>}
      
      {/* 👇 修复 1：只要已经支付成功（有 paidRequest 或 payment 提示），就不显示这句话了 */}
      {!loading && !error && available.length === 0 && !paidRequest && !payment && (
        <p className="mb-6 text-sm text-muted-foreground">No eligible grading applications are open for your account. Your dojo must confirm your membership and training requirements before a formal grading application.</p>
      )}
      
      {options.filter((option) => option.applied).map((option) => <p key={option.id} className="mb-4 rounded-xl border p-4 text-sm"><CheckCircle2 className="mr-2 inline size-4 text-primary" />Application submitted: {option.grade_label} · {option.name}</p>)}
      
      {!loading && savedDraft && <p role="status" className="mb-4 rounded-lg border p-4 text-sm">{paidRequest
        ? `Payment confirmed: ${progression?.target?.label}. Your request is awaiting dojo eligibility review. Do not pay again.`
        : verifyingRequest ? 'Payment verification pending. Do not pay again; contact your dojo if this persists.'
          : `Application draft saved: ${progression?.target?.label}. Not submitted. Formal submission requires an eligible grading session.`}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 👈 左侧：选择与条件核对 */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 shadow-sm border-gray-200">
            <h2 className="text-lg font-bold text-[#2c3f67] mb-4">1. Grading Details</h2>
            <div className="space-y-2">
              <p className="text-sm">Current Rank: <span className="font-bold">{loading ? 'Loading…' : progression?.current.label ?? 'Not recorded'}</span></p>
              <p id="target-grade-label" className="text-sm font-medium">Target grade</p>
              <div id="target-grade" aria-labelledby="target-grade-label" className="flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-lg border bg-background px-3 py-3 text-sm">
                <span className="font-semibold">{loading ? 'Loading…' : progression?.target?.label ?? (progression ? 'No further grade in your track' : 'Unavailable')}</span>
                {progression?.target && <span className="shrink-0 text-muted-foreground">Base fee: <span className="font-semibold text-foreground">{progression.feeCents === null ? 'Not configured' : money.format(progression.feeCents / 100)}</span></span>}
              </div>
              {progression?.target && <p className="text-sm text-muted-foreground">Your target grade is based on your recorded rank and grading track.</p>}
              {selected && <>
                <Label htmlFor="grading-event">Grading session</Label>
                <select id="grading-event" disabled={processing} value={selected.id} onChange={(event) => setEventId(event.target.value)} className="h-12 w-full rounded-lg border bg-background px-3 text-base">
                  {matching.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.grading_date}</option>)}
                </select>
                <p className="text-sm text-muted-foreground">{selected.centre_name} · Closing date: {selected.application_deadline} (Singapore time)</p>
              </>}
            </div>
          </Card>

          {selectedRule && (
            <Card className="p-6 shadow-sm border-gray-200 animate-in fade-in slide-in-from-bottom-2">
              <h2 className="text-lg font-bold text-[#2c3f67] mb-4">2. Eligibility Check</h2>
              <p className="text-sm text-gray-500 mb-4">Based on Aikido Shinju-Kai SOP:</p>

              <div className="space-y-4">
                {checks.map((check) => <div key={check.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                  <div><p className="font-semibold">{check.label}</p><p className="mt-1 text-xs text-muted-foreground">Required: {check.required}</p></div>
                  <p className="text-sm font-medium">{check.actual} {check.met && <CheckCircle2 className="ml-1 inline size-4 text-primary" />}</p>
                </div>)}
              </div>

              {!isEligible && (
                <div className="mt-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>You have not met the minimum requirements. Please continue training before applying.</p>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* 👈 右侧：费用与检查 */}
        <div className="lg:col-span-1">
          <Card className="p-6 shadow-sm border-gray-200 sticky top-24">
            <h2 className="text-lg font-bold text-[#2c3f67] mb-4">Order Summary</h2>

            <div className="space-y-3 text-sm border-b border-gray-100 pb-4 mb-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Applicant</span>
                <span className="font-medium">{studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Target Grade</span>
                <span className="font-medium">{progression?.target?.label ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Base Fee</span>
                <span className="font-medium">{selected || paidRequest ? money.format(baseFee) : progression?.feeCents != null ? money.format(progression.feeCents / 100) : '—'}</span>
              </div>
              {/* 逾期费提示 */}
              {isLateSubmission && (
                <div className="flex justify-between text-red-600 bg-red-50 p-2 rounded">
                  <span className="flex items-center gap-1"><Info className="w-3 h-3"/> Late Submission</span>
                  <span className="font-medium">+{money.format(lateFee)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-end mb-6">
              <span className="text-gray-900 font-bold">{paidRequest ? 'Amount Paid' : 'Total Due'}</span>
              <span className="text-3xl font-extrabold text-[#2c3f67]">{selected || testCheckout || paidRequest ? money.format(totalFee) : '—'}</span>
            </div>

            <Button
              onClick={() => void handleProceedToPayment()}
              disabled={Boolean(paidRequest || verifyingRequest) || (!isEligible && !testCheckout) || loading || processing || Boolean(error)}
              aria-describedby={testCheckout ? 'payment-preview-note' : undefined}
              className={`w-full h-12 text-base font-medium ${paidRequest ? 'bg-gray-400 cursor-not-allowed hover:bg-gray-400 text-white' : 'bg-[#2c3f67] hover:bg-[#1f2d4a] text-white'}`}
            >
              {paidRequest ? 'Payment Confirmed' : verifyingRequest ? 'Verifying Payment' : processing ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Redirecting to Stripe…</> : 'Proceed to Payment'}
            </Button>

            <p className="text-xs text-center text-muted-foreground mt-4 flex items-center justify-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Secure checkout powered by Stripe
            </p>
            {testCheckout && <p id="payment-preview-note" className="mt-2 text-center text-xs text-muted-foreground">Payment preview only. No charge or formal grading application.</p>}
          </Card>
        </div>
      </div>
    </main>
  )
}