import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { CalendarDays, Clock3, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useStudentCreditBatches } from '@/hooks/use-student-credit-batches'
import { creditBatchStatus } from '@/lib/student-credit-batches'

const expiryFormat = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: true,
})

export default function CreditBatchList({ userId }: { userId: string | undefined }) {
  const { hash } = useLocation()
  const { batches, loading, error, retry } = useStudentCreditBatches(userId)
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (hash === '#my-passes') document.getElementById('my-passes')?.scrollIntoView({ block: 'start' })
  }, [hash])
  const now = Date.now()
  const sorted = batches.filter(batch => batch.remaining > 0).sort((a, b) =>
    (a.expiresAt ? Date.parse(a.expiresAt) : Infinity) - (b.expiresAt ? Date.parse(b.expiresAt) : Infinity)
      || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  const visible = expanded ? sorted : sorted.slice(0, 6)

  return (
    <section id="my-passes" aria-labelledby="my-passes-title" className="mt-8 scroll-mt-24">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="my-passes-title" className="text-lg font-semibold">My passes & expiry</h2>
          <p className="mt-1 text-sm text-muted-foreground">Each point batch is listed separately, earliest expiry first. All times are Singapore time (SGT).</p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading || !userId} onClick={retry}>
          <RefreshCw aria-hidden="true" className="size-4" /> Refresh passes
        </Button>
      </div>
      {loading || error || !userId || sorted.length === 0 ? (
        <Card className="rounded-2xl p-5">
          {loading ? <p role="status" className="text-sm text-muted-foreground">Loading your passes…</p>
            : error ? <p role="alert" className="text-sm text-destructive">{error}</p>
              : !userId ? <p className="text-sm text-muted-foreground">Sign in to view your passes.</p>
                : <p className="text-sm text-muted-foreground">No point batches with credits remaining. New purchases will appear here after payment is confirmed.</p>}
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map(batch => {
            const status = creditBatchStatus(batch, now)
            const timeLeft = batch.expiresAt ? Date.parse(batch.expiresAt) - now : null
            const days = timeLeft === null ? null : Math.ceil(timeLeft / 86_400_000)
            const statusLabel = status === 'expired' ? 'Expired' : status === 'expiring' ? 'Expiring soon' : 'Active'
            return (
              <li key={batch.id} data-credit-batch={batch.id}>
                <Card className={`grid gap-3 rounded-2xl p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5 ${status === 'expired' ? 'bg-muted/50 text-muted-foreground' : ''}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{batch.title}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status === 'expiring'
                        ? 'bg-destructive text-white dark:text-destructive-foreground'
                        : status === 'active' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{statusLabel}</span>
                    </div>
                    <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      <span>{batch.legacy ? 'Carried over on' : 'Purchased on'} <time dateTime={batch.createdAt}>{expiryFormat.format(new Date(batch.createdAt))}</time> SGT</span>
                    </p>
                    <p className="mt-2 flex items-start gap-1.5 text-sm">
                      <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      {batch.expiresAt ? (
                        <span>{status === 'expired' ? 'Expired on' : 'Expires on'} <time dateTime={batch.expiresAt}>{expiryFormat.format(new Date(batch.expiresAt))}</time> SGT
                          {status !== 'expired' && days !== null && <span className="block text-muted-foreground">{days === 1 ? 'Expires within 1 day' : `${days} days remaining`}</span>}
                        </span>
                      ) : <span>No expiry recorded</span>}
                    </p>
                    {batch.expiresAt === null && <p className="mt-1 text-xs text-muted-foreground">{batch.legacy ? 'Carried-over balance. The original purchase dates and expiry dates are unavailable.' : 'No expiry date is recorded for this batch.'}</p>}
                    {timeLeft !== null && timeLeft > 0 && timeLeft < 21 * 86_400_000 && (
                      <p className="mt-2 flex items-start gap-1.5 text-sm font-semibold text-destructive">
                        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                        <span>Expiring in {days} {days === 1 ? 'day' : 'days'}!</span>
                      </p>
                    )}
                  </div>
                  <div className="text-sm sm:text-right">
                    <p className="font-semibold tabular-nums">{batch.remaining} / {batch.total} credits remaining</p>
                    {status === 'expired' && <p className="mt-1 text-xs text-muted-foreground">Not available for booking</p>}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      {!loading && !error && sorted.length > 6 && <Button type="button" variant="ghost" className="mt-2" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Show fewer passes' : `Show all ${sorted.length} passes`}
      </Button>}
    </section>
  )
}
