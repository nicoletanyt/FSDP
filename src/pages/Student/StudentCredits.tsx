import { useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { BadgeCheck, CreditCard, GraduationCap, ShieldCheck, Sparkles, User, Loader2 } from 'lucide-react'

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

  const heading = audience === 'junior' ? 'Junior Class Passes' : 'Adult Class Passes'
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
    <main className="mx-auto w-full max-w-4xl">
      <header className="text-center">
        <span className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3 text-primary">
          <CreditCard className="size-8" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
            {isStudent ? <GraduationCap className="size-4" aria-hidden="true" /> : <User className="size-4" aria-hidden="true" />}
            {membershipLabel(membershipType)}
          </span>
          {isStudent && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-red/10 px-3 py-1 font-semibold text-brand-red-ink">
              <BadgeCheck className="size-4" aria-hidden="true" />
              50% student discount applied
            </span>
          )}
          <Link to="/apply-membership" className="text-muted-foreground underline-offset-4 hover:underline">
            Change membership type
          </Link>
        </div>
      </header>

      {checkoutState === 'cancel' && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Checkout was canceled. No payment was taken.
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100">
          {error}
        </div>
      )}

      <section className="mt-8 space-y-4" aria-label="Class passes">
        {packages.map((pass) => (
          <Card
            key={pass.id}
            className={`relative flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center sm:p-6 ${
              pass.popular ? 'border-primary/40 bg-primary/5' : ''
            }`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">{pass.title}</h2>
                {pass.popular && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive-foreground">
                    <Sparkles className="size-3" aria-hidden="true" />
                    Popular
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {pass.credits === UNLIMITED_CREDITS ? 'Unlimited credits' : `${pass.credits} credits`} · {pass.validity}
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-extrabold tabular-nums">{money.format(pass.price)}</span>
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting to Stripe...
                </>
              ) : (
                'Purchase'
              )}
            </Button>
          </Card>
        ))}
      </section>

      <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="size-4" aria-hidden="true" />
        All prices are in SGD. Secure payments handled by Stripe.
      </p>
    </main>
  )
}
