import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from 'cn'
import type { EligibilityRequirement } from '@/lib/admin/types'

export default function EligibilityChecklist({
  requirements,
  compact = false,
}: {
  requirements: EligibilityRequirement[]
  compact?: boolean
}) {
  return (
    <ul className={cn('space-y-2', compact && 'space-y-1.5')}>
      {requirements.map((requirement) => (
        <li
          key={requirement.key}
          className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-background/60 px-3 py-2"
        >
          <span className="flex min-w-0 items-start gap-2">
            {requirement.met ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <span className={cn('text-sm', requirement.met ? '' : 'font-medium')}>
              {requirement.label}
            </span>
          </span>
          <span className="shrink-0 text-right text-xs tabular-nums">
            <span className={cn('font-medium', requirement.met ? 'text-success' : 'text-destructive')}>
              {requirement.actual}
            </span>
            <span className="text-muted-foreground"> / {requirement.required}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}
