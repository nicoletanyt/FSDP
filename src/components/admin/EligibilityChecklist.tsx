import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, ChevronRight, XCircle } from 'lucide-react'
import { cn } from 'cn'
import type { EligibilityRequirement } from '@/lib/admin/types'

export default function EligibilityChecklist({
  requirements,
  compact = false,
  techniqueDetails,
}: {
  requirements: EligibilityRequirement[]
  compact?: boolean
  techniqueDetails?: ReactNode
}) {
  const [techniquesOpen, setTechniquesOpen] = useState(false)
  const techniqueDetailsId = useId()

  return (
    <ul className={cn('space-y-2', compact && 'space-y-1.5')}>
      {requirements.map((requirement) => {
        const result = <>
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
            <span className="text-muted-foreground">
              {requirement.key === 'techniques' ? '/' : ' / '}
              {requirement.required}
            </span>
          </span>
        </>

        if (requirement.key === 'techniques' && techniqueDetails) {
          return <li key={requirement.key} className="rounded-lg border border-border/70 bg-background/60">
            <button type="button" aria-expanded={techniquesOpen} aria-controls={techniqueDetailsId}
              onClick={() => setTechniquesOpen(open => !open)}
              className="flex w-full cursor-pointer items-start justify-between gap-4 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <span className="flex min-w-0 flex-1 items-start justify-between gap-4">{result}</span>
              <ChevronRight className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', techniquesOpen && 'rotate-90')} aria-hidden="true" />
            </button>
            <div id={techniqueDetailsId} hidden={!techniquesOpen} className="border-t border-border/70 px-3 py-3">
              {techniquesOpen && techniqueDetails}
            </div>
          </li>
        }

        return <li key={requirement.key}
          className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-background/60 px-3 py-2">
          {result}
        </li>
      })}
    </ul>
  )
}
