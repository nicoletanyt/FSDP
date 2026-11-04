import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from 'cn'
import { formatSignedPercent } from '@/lib/admin/format'

type Tone = 'default' | 'success' | 'warning' | 'danger'

const toneClasses: Record<Tone, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/15 text-warning-foreground dark:text-warning',
  danger: 'bg-destructive/10 text-destructive',
}

export default function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'default',
  change,
}: {
  label: string
  value: string
  detail?: string
  icon: LucideIcon
  tone?: Tone
  change?: number
}) {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className={cn('flex size-8 items-center justify-center rounded-lg', toneClasses[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {change !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              change > 0 ? 'text-success' : change < 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {change > 0 ? (
              <ArrowUpRight className="size-3" aria-hidden="true" />
            ) : change < 0 ? (
              <ArrowDownRight className="size-3" aria-hidden="true" />
            ) : null}
            {formatSignedPercent(change)}
          </span>
        )}
        {detail && <span>{detail}</span>}
      </div>
    </div>
  )
}
