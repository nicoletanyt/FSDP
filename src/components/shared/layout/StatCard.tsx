import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from 'cn'
import { Link } from 'react-router'
import { formatSignedPercent } from '@/lib/admin/format'

type Tone = 'default' | 'success' | 'warning' | 'danger'

const toneClasses: Record<Tone, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning-foreground dark:text-warning',
  danger: 'bg-destructive/10 text-destructive',
}
const surfaceClasses: Record<Tone, string> = {
  default: 'bg-primary/5 ring-primary/20',
  success: 'bg-success/5 ring-success/20',
  warning: 'bg-warning/10 ring-warning/25',
  danger: 'bg-destructive/5 ring-destructive/20',
}

export default function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
  change,
  to,
}: {
  label: string
  value: string
  detail?: string
  icon: LucideIcon
  tone?: Tone
  change?: number
  to?: string
}) {
  const content = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-xl leading-tight font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</p>
          {change !== undefined && (
            <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium',
              change > 0 ? 'text-success' : change < 0 ? 'text-destructive' : 'text-muted-foreground')}>
              {change > 0 ? <ArrowUpRight className="size-3" aria-hidden="true" />
                : change < 0 ? <ArrowDownRight className="size-3" aria-hidden="true" /> : null}
              {formatSignedPercent(change)}
            </span>
          )}
          {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
        </div>
      </div>
      <span className={cn('hidden size-8 shrink-0 items-center justify-center rounded-lg sm:flex', toneClasses[tone])}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
    </div>
  )

  const className = cn(
    'block min-w-0 rounded-xl p-3 ring-1 sm:px-4',
    surfaceClasses[tone],
    to && 'transition-colors hover:ring-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
  )

  return to
    ? <Link to={to} className={className}>{content}</Link>
    : <div className={className}>{content}</div>
}
