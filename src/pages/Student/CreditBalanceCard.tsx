import { Link, useOutletContext } from 'react-router'
import { Plus, Ticket, TriangleAlert } from 'lucide-react'

import { buttonVariants } from '@/components/student/button'
import type { StudentContext } from '@/layouts/StudentLayout'

export default function CreditBalanceCard() {
  const { creditAccount } = useOutletContext<StudentContext>()
  const { credits, unlimited, loading, error, payment, retry, expiring } = creditAccount
  const daysLeft = expiring ? Math.ceil((Date.parse(expiring.expiresAt) - Date.now()) / 86_400_000) : 0
  const display = loading ? 'Loading…' : error ? 'Unavailable' : unlimited ? 'Unlimited' : String(credits)

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-6 text-primary-foreground shadow-lg">
      <div className="absolute -right-6 -top-6 size-32 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      <div className="absolute -bottom-6 -left-6 size-24 rounded-full bg-destructive/20 blur-xl" aria-hidden="true" />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Ticket className="size-5" aria-hidden="true" />
            <h3 className="font-medium">Available Credits</h3>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-4xl font-extrabold tabular-nums" aria-live="polite">{display}</span>
            {!loading && !error && !unlimited && <span className="text-sm opacity-80">/ classes</span>}
          </div>
          <p className="mt-2 text-xs opacity-80">1 credit = 1 training session</p>
          <Link to="/student/credits#my-passes" className="mt-2 inline-flex rounded text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
            View my passes & expiry
          </Link>
          <div className="mt-2 max-w-md text-sm" role="status">
            {error || (payment === 'pending'
              ? 'Confirming your payment. Your balance will update automatically.'
              : payment === 'confirmed'
                ? 'Payment confirmed. Your purchased credits are included in this balance.'
                : payment === 'delayed'
                  ? 'Payment confirmation is taking longer than expected. Check again shortly; do not purchase again.'
                  : '')}
            {(error || payment === 'delayed') && (
              <button type="button" onClick={retry} className="ml-2 rounded underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">
                Refresh balance
              </button>
            )}
          </div>
        </div>

        <Link
          to="/student/credits"
          className={buttonVariants({ variant: 'secondary', className: 'gap-2 px-4 py-2.5' })}
        >
          <Plus className="size-4" aria-hidden="true" />
          Top Up
        </Link>
      </div>
      {!loading && !error && expiring && daysLeft > 0 && daysLeft <= 21 && (
        <p role="status" className="relative z-10 mt-4 flex items-start gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white dark:text-destructive-foreground">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>Alert: {expiring.credits} {expiring.credits === 1 ? 'credit' : 'credits'} expiring in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}!</span>
        </p>
      )}
    </div>
  )
}
