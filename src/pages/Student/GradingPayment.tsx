import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  GraduationCap,
  Loader2,
  Lock,
  Landmark,
  Printer,
  Smartphone,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { money } from '@/lib/format'
import {
  calculateGradingFee, feesForTrack, gradingFeeFor, resolveGradingGradeId,
  GRADING_INFORMATION_URL, paymentMethodLabels, singaporeDate,
  type GradingTrack, type GradingPaymentMethod,
} from '@/lib/grading-fees'
import {
  formatCardNumber,
  formatCvc,
  formatExpiry,
  gradingReference,
  isValidExpiry,
  recordGradingPayment,
  type GradingPaymentLocationState,
  type GradingPaymentRecord,
} from '@/lib/grading-payment'
import { GradeLabelBadge } from '@/components/admin/AdminGradeBadge'
import GradeBadge from '@/components/GradeBadge'
import type { RankId } from '@/lib/student-grades'

type PaymentStatus = 'idle' | 'processing' | 'success'
type RecordStatus = 'idle' | 'saving' | 'saved' | 'failed'

type Receipt = {
  reference: string
  paidAt: Date
  last4: string
  method: GradingPaymentMethod
  baseFee: number
  lateFee: number
  total: number
}

const demoExpiry = () => {
  const year = new Date().getFullYear() + 3
  return `12 / ${String(year % 100).padStart(2, '0')}`
}

export default function GradingPayment() {
  const location = useLocation()
  const state = (location.state ?? {}) as GradingPaymentLocationState
  const { profile } = useAuth()

  const stateName = typeof state.studentName === 'string' ? state.studentName.trim() : ''
  const authName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim()
  const studentName = stateName || authName || 'Alex Tan'

  const currentBelt = (typeof state.currentBelt === 'string' && state.currentBelt.trim()) || '5th Kyu'
  const isPreview = !state.gradingEventId
  const initialGrade = resolveGradingGradeId(state.targetGradeId ?? state.targetBelt ?? '4-kyu') ?? ''
  const [gradeId, setGradeId] = useState(initialGrade)
  const [track, setTrack] = useState<GradingTrack>(state.gradingTrack === 'children' || (initialGrade && !feesForTrack('adult').some((grade) => grade.id === initialGrade)) ? 'children' : 'adult')
  const [deadline, setDeadline] = useState(state.applicationDeadline ?? '')
  const [method, setMethod] = useState<GradingPaymentMethod>('card')
  const [pricingDate, setPricingDate] = useState(() => new Date())
  const effectiveGradeId = isPreview ? gradeId : initialGrade
  const effectiveDeadline = isPreview ? deadline : state.applicationDeadline
  const price = calculateGradingFee(effectiveGradeId, effectiveDeadline, pricingDate)
  const targetBelt = gradingFeeFor(effectiveGradeId)?.label ?? state.targetBelt ?? 'Unknown grade'
  // Fee ids are the rank ids GradeBadge draws; fall back to the plain label when unknown.
  const gradeSystem = track === 'adult' ? 'adults' : 'children'
  const targetRank = gradingFeeFor(effectiveGradeId) ? effectiveGradeId as RankId : null
  const currentRank = resolveGradingGradeId(currentBelt) as RankId | null
  const fee = price?.total ?? 0

  // Recalculate across Singapore midnight, including while a page stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setPricingDate(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242')
  const [expiry, setExpiry] = useState(demoExpiry)
  const [cvc, setCvc] = useState('123')
  const [status, setStatus] = useState<PaymentStatus>('idle')
  const [formError, setFormError] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const [recordStatus, setRecordStatus] = useState<RecordStatus>('idle')
  const [savedRecord, setSavedRecord] = useState<GradingPaymentRecord | null>(null)
  const [recordError, setRecordError] = useState('')

  const cardDigits = cardNumber.replace(/\D/g, '')
  const cardBrand = cardDigits.startsWith('4')
    ? 'VISA'
    : cardDigits.startsWith('5')
      ? 'Mastercard'
      : cardDigits.startsWith('3')
        ? 'Amex'
        : 'Card'
  const isProcessing = status === 'processing'

  async function persistApplication() {
    setRecordStatus('saving')
    setRecordError('')
    try {
      const record = await recordGradingPayment({
        gradingEventId: state.gradingEventId,
        targetGradeId: effectiveGradeId,
      })
      setSavedRecord(record)
      setRecordStatus('saved')
    } catch (failure) {
      setRecordError(failure instanceof Error ? failure.message : 'The application could not be saved.')
      setRecordStatus('failed')
    }
  }

  useEffect(() => {
    if (status !== 'processing') return

    const timer = window.setTimeout(() => {
      const paidAt = new Date()
      setReceipt({
        reference: gradingReference(paidAt),
        paidAt,
        last4: cardDigits.slice(-4) || '4242',
        method,
        baseFee: price!.baseFee,
        lateFee: price!.lateFee,
        total: price!.total,
      })
      setStatus('success')
    }, 1500)

    return () => window.clearTimeout(timer)
  }, [cardDigits, status, method, price?.baseFee, price?.lateFee, price?.total])

  useEffect(() => {
    if (status !== 'success' || isPreview) return

    let active = true
    setRecordStatus('saving')
    setRecordError('')
    void recordGradingPayment({
      gradingEventId: state.gradingEventId,
      targetGradeId: effectiveGradeId,
    })
      .then((record) => {
        if (!active) return
        setSavedRecord(record)
        setRecordStatus('saved')
      })
      .catch((failure) => {
        if (!active) return
        setRecordError(failure instanceof Error ? failure.message : 'The application could not be saved.')
        setRecordStatus('failed')
      })

    return () => {
      active = false
    }
  }, [state.gradingEventId, effectiveGradeId, status, isPreview])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status !== 'idle') return
    if (!price) {
      setFormError('This grade has no configured fee. Please contact your dojo.')
      return
    }

    const currentPrice = calculateGradingFee(effectiveGradeId, effectiveDeadline)
    if (currentPrice?.total !== price.total) {
      setPricingDate(new Date())
      setFormError('The submission date has changed. Review the updated total and try again.')
      return
    }

    if (method === 'card' && cardDigits.length !== 16) {
      setFormError('Enter a complete 16-digit card number.')
      return
    }
    if (method === 'card' && !isValidExpiry(expiry)) {
      setFormError('Enter a valid future expiry date in MM / YY format.')
      return
    }
    if (method === 'card' && cvc.length < 3) {
      setFormError('Enter the 3 or 4 digit security code from your card.')
      return
    }

    setFormError('')
    setStatus('processing')
  }

  return (
    <div className="min-h-[calc(100dvh-var(--mobile-site-nav-height))] bg-[#f4f5f7] px-4 py-8 transition-colors sm:px-6 sm:py-12 lg:min-h-[calc(100dvh-5rem)] lg:px-8 lg:py-14 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              to="/grading/applications"
              aria-label="Back to grading applications"
              className="mt-1 grid size-10 shrink-0 place-items-center rounded-full bg-white text-slate-500 ring-1 ring-slate-900/5 transition hover:text-[#2c3f67] hover:ring-slate-300 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2c3f67]/30 dark:bg-slate-900 dark:text-slate-400 dark:ring-white/10"
            >
              <ArrowLeft className="size-4.5" aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#16233d] sm:text-3xl dark:text-white">
                Complete your grading payment
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                Review your grading fee and choose how to pay. This checkout simulates payment; no money is collected.
              </p>
            </div>
          </div>

          <ol className="hidden items-center gap-2 text-2xs font-medium text-slate-400 sm:flex" aria-label="Application progress">
            <li className="flex items-center gap-1.5">
              <span className="grid size-5 place-items-center rounded-full bg-[#2c3f67] text-[0.6875rem] font-bold text-white">1</span>
              Application
            </li>
            <li className="h-px w-5 bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
            <li className="flex items-center gap-1.5 text-[#2c3f67] dark:text-blue-300" aria-current="step">
              <span className="grid size-5 place-items-center rounded-full bg-[#2c3f67] text-[0.6875rem] font-bold text-white">2</span>
              Payment
            </li>
            <li className="h-px w-5 bg-slate-300 dark:bg-slate-700" aria-hidden="true" />
            <li className="flex items-center gap-1.5">
              <span className="grid size-5 place-items-center rounded-full border border-slate-300 bg-white text-[0.6875rem] font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-900">3</span>
              Confirmation
            </li>
          </ol>
        </header>

        {isPreview && status !== 'success' && (
          <section aria-label="Grading fee preview" className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-slate-900">
            <h2 className="font-semibold text-[#16233d] dark:text-white">Explore grading fees</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Preview a grade and its submission deadline. This does not change your eligibility or submit an application.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[0.8fr_1.5fr_1fr]">
              <div className="space-y-2">
                <Label htmlFor="grading-track">Grading track</Label>
                <select id="grading-track" value={track} disabled={isProcessing}
                  onChange={(event) => {
                    const next = event.target.value as GradingTrack
                    setTrack(next)
                    if (!feesForTrack(next).some((grade) => grade.id === gradeId)) setGradeId('6-kyu')
                  }}
                  className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 focus-visible:outline-2 focus-visible:outline-[#2c3f67] disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                  <option value="adult">Adult</option><option value="children">Children</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grading-rank">Target grade</Label>
                <select id="grading-rank" value={gradeId} disabled={isProcessing} onChange={(event) => setGradeId(event.target.value)}
                  className="h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-800 focus-visible:outline-2 focus-visible:outline-[#2c3f67] disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
                  {!gradingFeeFor(gradeId) && <option value="">Select a grade</option>}
                  {feesForTrack(track).map((grade) => <option key={grade.id} value={grade.id}>{grade.label} — {money.format(grade.fee)}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="grading-deadline">Application deadline</Label>
                <Input id="grading-deadline" type="date" value={deadline} disabled={isProcessing} onChange={(event) => setDeadline(event.target.value)} className="h-12 min-w-0 bg-transparent text-base lg:h-12" aria-describedby="deadline-help" />
              </div>
            </div>
            <p id="deadline-help" className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">Choose a past deadline to preview the S$22 late submission charge. Today in Singapore: {singaporeDate(pricingDate)}. Actual late applications require dojo approval.</p>
          </section>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-6">
          <Card className="gap-0 overflow-hidden rounded-2xl bg-white py-0 ring-1 ring-slate-900/5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_40px_-24px_rgba(16,24,40,0.28)] dark:bg-slate-900 dark:ring-white/10">
            <div className="border-b border-slate-100 px-5 py-4 sm:px-6 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 place-items-center rounded-full bg-[#eef1f7] text-[#2c3f67] dark:bg-blue-500/15 dark:text-blue-300">
                    <GraduationCap className="size-4.5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      <span className="sm:hidden">Grading</span>
                      <span className="hidden sm:inline">Grading application</span>
                    </p>
                    <p className="font-semibold text-[#16233d] dark:text-white">Order summary</p>
                  </div>
                </div>
                <span
                  className={
                    status === 'success'
                      ? 'inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-2xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20'
                      : 'inline-flex shrink-0 items-center rounded-full bg-[#f4f6fa] px-2.5 py-1 text-2xs font-semibold text-[#2c3f67] ring-1 ring-slate-200 dark:bg-white/5 dark:text-blue-300 dark:ring-white/10'
                  }
                >
                  {status === 'success' ? (
                    <>
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Paid
                    </>
                  ) : (
                    <>
                      <span className="min-[360px]:hidden">Ready</span>
                      <span className="hidden min-[360px]:inline">Ready to pay</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            <div className="px-5 py-5 sm:px-6 sm:py-6">
              <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-slate-400">Student</p>
              <p className="mt-1 break-words text-xl font-semibold tracking-tight text-[#16233d] dark:text-white">{studentName}</p>

              <div className="mt-5 rounded-xl bg-[#f7f8fa] p-4 ring-1 ring-slate-100 dark:bg-white/5 dark:ring-white/10">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 max-w-[40%] shrink-0">
                    <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-400">Current</p>
                    <div className="mt-1">{currentRank ? <GradeBadge rank={currentRank} system={gradeSystem} /> : <GradeLabelBadge label={currentBelt} />}</div>
                  </div>
                  <div className="relative flex min-w-8 flex-1 items-center justify-center" aria-hidden="true">
                    <span className="h-px w-full bg-slate-200 dark:bg-slate-700" />
                    <span className="absolute grid size-7 place-items-center rounded-full border border-slate-200 bg-white text-[#2c3f67] shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300">
                      <ArrowRight className="size-3.5" />
                    </span>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-400">Target</p>
                    <div className="mt-1 flex justify-end">{targetRank ? <GradeBadge rank={targetRank} system={gradeSystem} /> : <GradeLabelBadge label={targetBelt} />}</div>
                  </div>
                </div>
              </div>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Grading examination fee</dt>
                  <dd className="shrink-0 font-medium tabular-nums text-[#16233d] dark:text-white">{price ? money.format(price.baseFee) : 'Unavailable'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Late submission charge</dt>
                  <dd className={price?.late ? 'shrink-0 font-semibold text-amber-800 dark:text-amber-300' : 'shrink-0 font-medium text-slate-600 dark:text-slate-300'}>{price?.late ? `+ ${money.format(price.lateFee)}` : money.format(0)}</dd>
                </div>
              </dl>

              {effectiveDeadline && <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Closing date: {effectiveDeadline} · Singapore time</p>}
              {price?.late && <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">Submitted after the closing date: S$22 is added to the grading fee. Paying this charge does not override eligibility or guarantee late acceptance.</p>}

              <div className="mt-4 flex items-end justify-between gap-4 border-t border-dashed border-slate-200 pt-4 dark:border-white/15">
                <div>
                  <p className="text-sm font-semibold text-[#16233d] dark:text-white">{status === 'success' ? 'Demo total' : 'Total due'}</p>
                  <p className="text-2xs text-slate-400">One-time payment</p>
                </div>
                <p className="text-3xl font-bold tracking-tight tabular-nums text-[#16233d] dark:text-white">{price ? money.format(fee) : '—'}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-[#fafbfc] px-5 py-4 sm:px-6 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <p className="text-2xs leading-relaxed text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Demo checkout.</span>{' '}
                  Use test details only. Card, PayNow and bank transfer payments are simulated; no card details are saved to Supabase.
                </p>
              </div>
            </div>
          </Card>

          <Card className="gap-0 overflow-hidden rounded-2xl bg-white py-0 ring-1 ring-slate-900/5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_40px_-24px_rgba(16,24,40,0.28)] dark:bg-slate-900 dark:ring-white/10">
            {status === 'success' && receipt ? (
              <div className="flex min-h-[32rem] flex-col items-center justify-center px-5 py-9 text-center sm:px-8 sm:py-12">
                <div className="relative mb-5 grid size-20 place-items-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-50 motion-safe:duration-500">
                  <span className="absolute inset-0 rounded-full bg-emerald-100 motion-safe:animate-ping [animation-iteration-count:1] dark:bg-emerald-400/15" aria-hidden="true" />
                  <span className="relative grid size-20 place-items-center rounded-full bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-400/10 dark:ring-emerald-400/25">
                    <CheckCircle2 className="size-11 text-emerald-600 dark:text-emerald-400" strokeWidth={1.7} aria-hidden="true" />
                  </span>
                </div>

                <div role="status" aria-live="polite">
                  <h2 className="text-2xl font-bold tracking-tight text-[#16233d] dark:text-white">Payment Successful</h2>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    Demo payment completed. No money was collected.{isPreview ? ' No application was submitted.' : ' Application saving status is shown below.'}
                  </p>
                </div>

                <dl className="mt-6 w-full divide-y divide-slate-100 rounded-xl border border-slate-100 bg-[#f8f9fb] px-4 text-left dark:divide-white/10 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-400">Student</dt>
                    <dd className="min-w-0 break-words text-right text-sm font-medium text-slate-700 dark:text-slate-200">{studentName}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-400">Target rank</dt>
                    <dd className="text-right text-sm">{targetRank ? <GradeBadge rank={targetRank} system={gradeSystem} showBeltLabel /> : <GradeLabelBadge label={targetBelt} />}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-400">Grading fee</dt>
                    <dd className="text-right text-sm font-semibold tabular-nums text-[#16233d] dark:text-white">{money.format(receipt.baseFee)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-xs text-slate-600 dark:text-slate-300">Late submission charge</dt>
                    <dd className="text-right text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">{money.format(receipt.lateFee)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-sm font-semibold text-slate-700 dark:text-slate-200">Demo total</dt>
                    <dd className="text-right text-sm font-semibold tabular-nums text-[#16233d] dark:text-white">{money.format(receipt.total)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-400">Payment date</dt>
                    <dd className="text-right text-sm text-slate-700 dark:text-slate-200">
                      {receipt.paidAt.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-400">Reference</dt>
                    <dd className="text-right text-xs font-medium tabular-nums text-slate-700 sm:text-sm dark:text-slate-200">{receipt.reference}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-400">Method</dt>
                    <dd className="text-right text-sm text-slate-700 dark:text-slate-200">{paymentMethodLabels[receipt.method]}{receipt.method === 'card' ? ` · •••• ${receipt.last4}` : ''}</dd>
                  </div>
                </dl>

                <div className="mt-4 w-full">
                  {isPreview && <p className="text-xs text-slate-600 dark:text-slate-300">Preview receipt only — no application saved.</p>}
                  {recordStatus === 'saving' && (
                    <p className="flex items-center justify-center gap-2 text-2xs text-slate-500 dark:text-slate-400">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      Saving your application…
                    </p>
                  )}
                  {recordStatus === 'saved' && (
                    <p className="flex items-center justify-center gap-2 text-2xs font-medium text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                      Application saved{savedRecord ? ` · ${savedRecord.applicationId.slice(0, 8).toUpperCase()}` : ''}
                    </p>
                  )}
                  {recordStatus === 'failed' && (
                    <div role="alert" className="rounded-lg bg-amber-50 px-3 py-2.5 text-left ring-1 ring-amber-200 dark:bg-amber-400/10 dark:ring-amber-400/20">
                      <p className="flex items-start gap-2 text-2xs leading-relaxed text-amber-800 dark:text-amber-200">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        <span>Payment complete, but the application record could not be synced. {recordError}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => void persistApplication()}
                        className="mt-2 ml-5 text-2xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700 dark:text-amber-100"
                      >
                        Try saving again
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                  <Link
                    to="/grading/applications"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2c3f67] px-4 text-sm font-semibold text-white transition hover:bg-[#223453] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#2c3f67]/30 dark:bg-blue-600 dark:hover:bg-blue-500"
                  >
                    Back to grading
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.print()}
                    className="h-11 rounded-xl border-slate-200 bg-white text-sm font-semibold text-[#2c3f67] hover:bg-slate-50 dark:border-white/15 dark:bg-transparent dark:text-blue-300 dark:hover:bg-white/5"
                  >
                    <Printer className="size-4" aria-hidden="true" />
                    Print receipt
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-slate-100 px-5 py-4 sm:px-6 dark:border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-9 place-items-center rounded-full bg-[#eef1f7] text-[#2c3f67] dark:bg-blue-500/15 dark:text-blue-300">
                        <CreditCard className="size-4.5" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="hidden text-2xs font-semibold uppercase tracking-[0.14em] text-slate-500 min-[360px]:block">Demo checkout</p>
                        <p className="font-semibold text-[#16233d] dark:text-white">Payment details</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 text-2xs font-medium text-emerald-700 dark:text-emerald-300">
                      <ShieldCheck className="size-3.5" aria-hidden="true" />
                      <span className="sr-only min-[360px]:not-sr-only">Test mode</span>
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSubmit} noValidate className="px-5 py-5 sm:px-6 sm:py-6">
                  <div className="space-y-5">
                    <fieldset disabled={isProcessing}>
                      <legend className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Payment method</legend>
                      <div className="grid gap-2 min-[400px]:grid-cols-3">
                        {(['card', 'paynow', 'bank_transfer'] as const).map((value) => {
                          const Icon = value === 'card' ? CreditCard : value === 'paynow' ? Smartphone : Landmark
                          const label = value === 'card' ? 'Card' : paymentMethodLabels[value]
                          return <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#2c3f67] ${method === value ? 'border-[#2c3f67] bg-[#eef1f7] text-[#2c3f67] dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-white/5'}`}>
                            <input type="radio" name="payment-method" value={value} checked={method === value} onChange={() => { setMethod(value); setFormError('') }} className="size-4 shrink-0 accent-[#2c3f67] dark:accent-blue-400" />
                            <Icon className="size-4 shrink-0" aria-hidden="true" />
                            <span>{label}</span>
                          </label>
                        })}
                      </div>
                    </fieldset>

                    {method === 'card' ? <>
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <Label htmlFor="card-number" className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                          Card number
                        </Label>
                        <span className="text-2xs text-slate-400">Test card</span>
                      </div>
                      <div className="group relative">
                        <CreditCard className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#2c3f67] dark:text-slate-500 dark:group-focus-within:text-blue-300" aria-hidden="true" />
                        <Input
                          id="card-number"
                          name="card-number"
                          inputMode="numeric"
                          autoComplete="cc-number"
                          value={cardNumber}
                          onChange={(event) => setCardNumber(formatCardNumber(event.target.value))}
                          disabled={isProcessing}
                          aria-invalid={Boolean(formError) && cardDigits.length !== 16}
                          aria-describedby={formError ? 'payment-error' : undefined}
                          className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pr-3 pl-11 font-mono text-sm tracking-wide text-[#16233d] shadow-none placeholder:text-slate-400 focus-visible:border-[#2c3f67] focus-visible:bg-white focus-visible:ring-[#2c3f67]/15 min-[360px]:pr-14 min-[360px]:text-base sm:pr-20 lg:h-12 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus-visible:bg-white/10"
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide text-slate-500 min-[360px]:block dark:border-white/15 dark:bg-slate-800 dark:text-slate-300">
                          {cardBrand}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="card-expiry" className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                          Expiry
                        </Label>
                        <div className="group relative">
                          <CalendarDays className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#2c3f67] dark:text-slate-500 dark:group-focus-within:text-blue-300" aria-hidden="true" />
                          <Input
                            id="card-expiry"
                            name="card-expiry"
                            inputMode="numeric"
                            autoComplete="cc-exp"
                            placeholder="MM / YY"
                            value={expiry}
                            onChange={(event) => setExpiry(formatExpiry(event.target.value))}
                            disabled={isProcessing}
                            aria-invalid={Boolean(formError) && !isValidExpiry(expiry)}
                            aria-describedby={formError ? 'payment-error' : undefined}
                            className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pl-11 font-mono text-base tracking-wide text-[#16233d] shadow-none placeholder:text-slate-400 focus-visible:border-[#2c3f67] focus-visible:bg-white focus-visible:ring-[#2c3f67]/15 lg:h-12 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus-visible:bg-white/10"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <Label htmlFor="card-cvc" className="text-2xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            CVC
                          </Label>
                          <span className="text-2xs text-slate-400">3 digits</span>
                        </div>
                        <div className="group relative">
                          <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#2c3f67] dark:text-slate-500 dark:group-focus-within:text-blue-300" aria-hidden="true" />
                          <Input
                            id="card-cvc"
                            name="card-cvc"
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            placeholder="123"
                            value={cvc}
                            onChange={(event) => setCvc(formatCvc(event.target.value))}
                            disabled={isProcessing}
                            aria-invalid={Boolean(formError) && cvc.length < 3}
                            aria-describedby={formError ? 'payment-error' : undefined}
                            className="h-12 rounded-xl border-slate-200 bg-slate-50/70 pl-11 font-mono text-base tracking-wide text-[#16233d] shadow-none placeholder:text-slate-400 focus-visible:border-[#2c3f67] focus-visible:bg-white focus-visible:ring-[#2c3f67]/15 lg:h-12 dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus-visible:bg-white/10"
                          />
                        </div>
                      </div>
                    </div>

                    </> : (
                      <div className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600 dark:bg-white/5 dark:text-slate-300">
                        <h3 className="font-semibold text-slate-800 dark:text-white">{method === 'paynow' ? 'PayNow preview' : 'Bank transfer preview'}</h3>
                        <p className="mt-2">{method === 'paynow'
                          ? 'A live PayNow checkout would provide a merchant QR code or payment request for this total. No merchant QR or UEN has been configured here.'
                          : 'A live bank transfer would use verified dojo bank details and wait for reconciliation. No recipient account has been configured here.'}</p>
                        <p className="mt-3 font-medium text-slate-800 dark:text-slate-100">Do not send money. Use the button below to simulate this method.</p>
                      </div>
                    )}

                    {formError && (
                      <p id="payment-error" role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-2xs font-medium leading-relaxed text-red-700 ring-1 ring-red-100 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/20">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        {formError}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-slate-100 pt-4 text-2xs text-slate-400 dark:border-white/10">
                      <span className="flex items-center gap-1.5">
                        <Lock className="size-3.5" aria-hidden="true" />
                        Demo checkout — no charge
                      </span>
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        Test details only
                      </span>
                    </div>

                    <Button
                      type="submit"
                      disabled={isProcessing || !price}
                      className="h-13 w-full rounded-xl bg-[#2c3f67] px-5 text-base font-semibold text-white shadow-[0_12px_28px_-14px_rgba(44,63,103,0.85)] transition hover:bg-[#223453] focus-visible:ring-3 focus-visible:ring-[#2c3f67]/30 disabled:opacity-80 dark:bg-blue-600 dark:hover:bg-blue-500"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Lock className="size-4.5" aria-hidden="true" />
                          {method === 'card' ? 'Pay Now' : <><span className="min-[400px]:hidden">Simulate</span><span className="hidden min-[400px]:inline">Simulate payment</span></>}
                          <span className="ml-auto rounded-md bg-white/10 px-2 py-0.5 text-sm font-semibold tabular-nums">
                            {money.format(fee)}
                          </span>
                        </>
                      )}
                    </Button>

                    <p className="flex items-center justify-center gap-1.5 text-center text-2xs leading-relaxed text-slate-400">
                      <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                      Demo only. Real payment requires a verified provider confirmation.
                    </p>
                  </div>
                </form>
              </>
            )}
          </Card>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          Fees: supplied ASK grading SOP · Late submission: +S$22.<br />
          <a href={GRADING_INFORMATION_URL} target="_blank" rel="noreferrer" className="font-medium text-[#2c3f67] underline underline-offset-4 dark:text-blue-300">Official grading information and deadlines</a>
          {' '}· Confirm current charges with your dojo.
        </p>
        <p className="mt-3 flex items-start justify-center gap-2 text-center text-2xs text-slate-500 dark:text-slate-400 sm:items-center">
          <Lock className="mt-0.5 size-3.5 shrink-0 sm:mt-0" aria-hidden="true" />
          <span>Need help? Contact your dojo before submitting payment.</span>
        </p>
      </div>
    </div>
  )
}
