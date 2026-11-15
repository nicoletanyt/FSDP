import { Link, useOutletContext } from 'react-router'
import { Plus, Ticket, TriangleAlert } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import type { StudentContext } from '@/layouts/StudentLayout'

export default function CreditBalanceCard({ topUp = true }: { topUp?: boolean }) {
  const { creditAccount } = useOutletContext<StudentContext>()
  const { credits, unlimited, loading, error, payment, retry, expiring } = creditAccount
  const daysLeft = expiring ? Math.ceil((Date.parse(expiring.expiresAt) - Date.now()) / 86_400_000) : 0
  const display = loading ? 'Loading…' : error ? 'Unavailable' : unlimited ? 'Unlimited' : String(credits)
  const notice = error || (payment === 'pending'
    ? 'Confirming your payment. Your balance will update automatically.'
    : payment === 'confirmed'
      ? 'Payment confirmed. Your purchased credits are included in this balance.'
      : payment === 'delayed'
        ? 'Payment confirmation is taking longer than expected. Check again shortly; do not purchase again.'
        : '')

  return (
    <div className="rounded-xl bg-primary/5 p-4 ring-1 ring-primary/20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Ticket className="size-4" aria-hidden="true" />
            Available credits
          </h2>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold tracking-tight tabular-nums" aria-live="polite">{display}</span>
            {!loading && !error && !unlimited && <span className="text-sm text-muted-foreground">{credits === 1 ? 'credit' : 'credits'}</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">1 credit = 1 class</p>
          {topUp && (
            <Link to="/student/credits#my-passes" className="mt-2 inline-flex min-h-11 items-center rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring lg:min-h-0">
              View my passes and expiry
            </Link>
          )}
          <div className="mt-2 max-w-md text-sm" role="status">
            {notice}
            {(error || payment === 'delayed') && (
              <button type="button" onClick={retry} className="ml-2 rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
                Refresh balance
              </button>
            )}
          </div>
        </div>

        {topUp && (
          <Link to="/student/credits" className={buttonVariants({ size: 'touch', className: 'gap-2 px-4' })}>
            <Plus className="size-4" aria-hidden="true" />
            Top up
          </Link>
        )}
      </div>
      {!loading && !error && expiring && daysLeft > 0 && daysLeft <= 21 && (
        <p role="status" data-expiry-notice className="mt-3 flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm font-medium text-warning-foreground dark:text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{expiring.credits} {expiring.credits === 1 ? 'credit expires' : 'credits expire'} in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}</span>
        </p>
      )}
    </div>
  )
}
