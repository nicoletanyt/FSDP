import { Link, useOutletContext } from 'react-router'
import { Info, Plus, Ticket, TriangleAlert } from 'lucide-react'

import { Button, buttonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { StudentContext } from '@/layouts/StudentLayout'

export default function CreditBalanceCard({ topUp = true, compact = false }: {
  topUp?: boolean
  /** One line ("10 credits available"), for the Credits page where the passes below give the detail. */
  compact?: boolean
}) {
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

  const expiryNotice = !loading && !error && expiring && daysLeft > 0 && daysLeft <= 21 && (
    <p role="status" data-expiry-notice className={`${compact ? 'mt-2' : 'mt-3'} flex items-start gap-2 rounded-lg bg-warning/15 px-3 py-2 text-sm font-medium text-warning-foreground dark:text-warning`}>
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{expiring.credits} {expiring.credits === 1 ? 'credit expires' : 'credits expire'} in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}</span>
    </p>
  )
  const statusLine = (
    <div className={notice ? 'mt-2 max-w-md text-sm' : ''} role="status">
      {notice}
      {(error || payment === 'delayed') && (
        <button type="button" onClick={retry} className="ml-2 rounded-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
          Refresh balance
        </button>
      )}
    </div>
  )

  if (compact) {
    return (
      <div className="rounded-lg bg-primary/5 px-4 py-3 ring-1 ring-primary/20">
        <h2 className="sr-only">Available credits</h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Ticket className="size-4" aria-hidden="true" />
          </span>
          {/* The balance on one line; how credits work sits behind the ⓘ. */}
          <p className="flex items-baseline gap-x-1.5 whitespace-nowrap">
            <span className="text-xl font-semibold tracking-tight tabular-nums" aria-live="polite">{display}</span>
            {!loading && !error && (
              <span className="text-sm text-muted-foreground">
                {unlimited ? 'pass' : `${credits === 1 ? 'credit' : 'credits'} available`}
              </span>
            )}
          </p>
          <Popover>
            <PopoverTrigger
              render={<Button type="button" variant="ghost" size="icon-touch" className="-my-2 ml-auto" aria-label="How credits work" />}
            >
              <Info aria-hidden="true" className="size-4 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto text-sm">
              1 credit = 1 class
            </PopoverContent>
          </Popover>
        </div>
        {statusLine}
        {expiryNotice}
      </div>
    )
  }

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
      {expiryNotice}
    </div>
  )
}
