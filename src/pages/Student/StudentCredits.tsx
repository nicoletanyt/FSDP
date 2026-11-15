import { useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { BadgeCheck, GraduationCap, ShieldCheck, Sparkles, User, Loader2 } from 'lucide-react'

import PageHeader from '@/components/shared/layout/PageHeader'
import { StatusBadge } from '@/components/shared/status/StatusBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  classPassAudience,
  isStudentMembership,
  membershipLabel,
  resolveMembershipType,
  type MembershipType,
} from '@/lib/membership'
import { money } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/use-auth'
import CreditBatchList from '@/components/student/CreditBatchList'
import CreditBalanceCard from './CreditBalanceCard'
import MembershipGate from '@/components/student/MembershipGate'

const UNLIMITED_CREDITS = 9999

type PassPackage = {
  id: string
  title: string
  price: number
  credits: number
  unitPrice: string
  validity: string
  popular?: boolean
  originalPrice?: number
}

const ADULT_PASSES: PassPackage[] = [
  { id: 'adult-10', title: '10 Session Pass', price: 270, credits: 10, unitPrice: '$27.00 / Session', validity: 'Valid for 11 weeks' },
  { id: 'adult-25', title: '25 Session Pass', price: 600, credits: 25, unitPrice: '$24.00 / Session', validity: 'Valid for 4 months', popular: true },
  { id: 'adult-50', title: '50 Session Pass', price: 980, credits: 50, unitPrice: '$19.60 / Session', validity: 'Valid for 6 months' },
  { id: 'adult-1y', title: '1 Year Unlimited Pass', price: 2246.4, credits: UNLIMITED_CREDITS, unitPrice: 'Inclusive of 10% discount', validity: 'Valid for 12 months' },
  { id: 'adult-12w', title: "12 Weeks' Unlimited Pass", price: 96, credits: UNLIMITED_CREDITS, unitPrice: '6 recurring payments', validity: 'Billed every 2 weeks' },
  { id: 'adult-3m', title: "3 Months' Unlimited Pass", price: 576, credits: UNLIMITED_CREDITS, unitPrice: 'Unlimited sessions', validity: 'Valid for 3 months' },
]

const JUNIOR_PASSES: PassPackage[] = [
  { id: 'junior-1m', title: '1 Month Pass', price: 150, credits: 4, unitPrice: '$37.50 / Session', validity: 'Valid for 5 weeks' },
  { id: 'junior-6m-24', title: '6 Months Pass (24 Sessions)', price: 834, credits: 24, unitPrice: '$34.75 / Session', validity: 'Valid for 6 months', popular: true },
  { id: 'junior-6m-50', title: '6 Months Pass (50 Sessions)', price: 1200, credits: 50, unitPrice: '$24.00 / Session', validity: 'Valid for 6 months' },
]

const STUDENT_DISCOUNT = 0.5

async function checkoutErrorMessage(error: unknown) {
  const context = (error as { context?: Response } | null)?.context
  if (context instanceof Response) {
    try {
      const body = await context.clone().json() as { error?: unknown }
      if (typeof body.error === 'string' && body.error) return body.error
    } catch {
      // Fall through to the generic message.
    }
  }
  return error instanceof Error ? error.message : 'Unable to initiate checkout.'
}

function applyStudentDiscount(packages: PassPackage[]): PassPackage[] {
  return packages.map((pass) => {
    const price = Math.round(pass.price * STUDENT_DISCOUNT * 100) / 100
    return {
      ...pass,
      price,
      originalPrice: pass.price,
      unitPrice: pass.credits === UNLIMITED_CREDITS
        ? pass.unitPrice
        : `${money.format(price / pass.credits)} / Session`,
    }
  })
}

export default function StudentCredits() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [membershipType] = useState<MembershipType>(() => resolveMembershipType())
  const [loadingPassId, setLoadingPassId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const checkoutState = searchParams.get('checkout')

  const audience = classPassAudience(membershipType)
  const isStudent = isStudentMembership(membershipType)

  const packages = useMemo(() => {
    const base = audience === 'junior' ? JUNIOR_PASSES : ADULT_PASSES
    return isStudent ? applyStudentDiscount(base) : base
  }, [audience, isStudent])

  const heading = audience === 'junior' ? 'Junior class passes' : 'Adult class passes'
  const description = isStudent
    ? 'Student members receive 50% off adult class pass rates. Please bring your full-time student ID when collecting your pass.'
    : membershipType === 'senior'
      ? 'You are registered as a Senior member. The adult class passes below apply to your membership.'
      : membershipType === 'junior'
        ? 'You are registered as a Junior member. Children class passes are shown below.'
        : 'You are registered as an Adult member. Purchase your class passes below.'

  // 👇 核心逻辑：直接跳转真实 Stripe Checkout
  const handlePurchase = async (pass: PassPackage) => {
    setLoadingPassId(pass.id)
    setError('')

    try {
      // The Edge Function resolves the price server-side; never send an amount.
      // Only the verified webhook creates a batch and its expiration. Returning
      // from Checkout must never insert credits from the browser.
      const { data, error: fnError } = await supabase.functions.invoke<{ url: string }>(
        'create-credit-checkout',
        {
          body: { passId: pass.id, membershipType },
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        },
      )

      if (fnError) throw new Error(await checkoutErrorMessage(fnError))
      if (!data?.url) throw new Error('Stripe did not return a Checkout URL.')

      // 👈 直接跳转到 Stripe 官方页面！
      window.location.assign(data.url)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Unable to initiate checkout.')
      setLoadingPassId(null)
    }
  }

  // Also support already-created Stripe sessions with the old return URL.
  if (checkoutState === 'success') return <Navigate to={`/dashboard?${searchParams}`} replace />

  return (
    <MembershipGate title="Credits" feature="Buying class passes">
    <section className="w-full">
      <PageHeader title="Credits" description={description} />

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge tone="info" dot={false}>
            {isStudent ? <GraduationCap aria-hidden="true" /> : <User aria-hidden="true" />}
            {membershipLabel(membershipType)}
          </StatusBadge>
          {isStudent && (
            <StatusBadge tone="success" dot={false}>
              <BadgeCheck aria-hidden="true" />
              50% student discount applied
            </StatusBadge>
          )}
          <Link to="/apply-membership" className="text-muted-foreground underline-offset-4 hover:underline">
            Change membership type
          </Link>
      </div>

      {checkoutState === 'cancel' && (
        <Alert role="status" className="mt-6">
          <AlertDescription>Checkout was cancelled. No payment was taken.</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6">
        <CreditBalanceCard topUp={false} />
      </div>

      <CreditBatchList userId={profile?.id} />

      <section className="mt-8 space-y-4" aria-label="Class passes">
        <h2 className="text-lg font-semibold">Buy {heading.toLowerCase()}</h2>
        <div className="grid gap-4 xl:grid-cols-2">
        {packages.map((pass) => (
          <Card
            key={pass.id}
            className={`relative flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center ${
              pass.popular ? 'bg-primary/5 ring-primary/40' : ''
            }`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">{pass.title}</h3>
                {pass.popular && (
                  <StatusBadge tone="info" dot={false}>
                    <Sparkles aria-hidden="true" />
                    Popular
                  </StatusBadge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {pass.credits === UNLIMITED_CREDITS ? 'Unlimited classes' : `${pass.credits} credits`} · {pass.validity}
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{money.format(pass.price)}</span>
                {pass.originalPrice !== undefined && (
                  <span className="text-sm text-muted-foreground line-through tabular-nums">
                    {money.format(pass.originalPrice)}
                  </span>
                )}
                <span className="text-xs font-medium text-muted-foreground">({pass.unitPrice})</span>
              </div>
            </div>

            <Button
              type="button"
              onClick={() => handlePurchase(pass)}
              disabled={loadingPassId !== null}
              className="w-full shrink-0 px-8 sm:w-auto"
              size="lg"
            >
              {loadingPassId === pass.id ? (
                <>
                  <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Redirecting to Stripe…
                </>
              ) : (
                'Purchase'
              )}
            </Button>
          </Card>
        ))}
        </div>
      </section>

      <p className="mt-8 flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" aria-hidden="true" />
        All prices are in SGD. Secure payments handled by Stripe. Pass validity starts when payment is confirmed.
      </p>
    </section>
    </MembershipGate>
  )
}
