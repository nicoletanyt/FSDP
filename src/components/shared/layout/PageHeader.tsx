import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { BackArrow } from './BackLink'

export default function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    // Every page header owns the gap below it: 16px on phones, 24px from md.
    // As a class it overrides a parent's space-y-*.
    <header className={cn('mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 md:mb-6', className)}>
      <div className="min-w-0">
        {/* Inside a BackNav, phones get ‹ and the title on one row. */}
        <div className="flex items-start gap-1">
          <BackArrow />
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        </div>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
