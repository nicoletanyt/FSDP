import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Wrapper: announces one loading message to assistive tech, hides the bars. */
function Region({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">{children}</div>
    </div>
  )
}

/** Table-shaped rows inside a bordered container. */
export function TableSkeleton({ rows = 6, cols = 4, label = 'Loading…' }: { rows?: number; cols?: number; label?: string }) {
  return (
    <Region label={label}>
      <div className="overflow-hidden rounded-lg border">
        <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
          {Array.from({ length: cols }, (_, index) => <Skeleton key={index} className="h-3 flex-1" />)}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div key={row} className="flex min-h-14 items-center gap-4 border-b px-4 py-3 last:border-b-0">
            {Array.from({ length: cols }, (_, col) => (
              <Skeleton key={col} className={col === 0 ? 'h-4 flex-[1.5]' : 'h-4 flex-1 max-sm:hidden first:max-sm:block'} />
            ))}
          </div>
        ))}
      </div>
    </Region>
  )
}

/** Stack of card rows: avatar-less title + meta lines. */
export function CardListSkeleton({ count = 3, label = 'Loading…' }: { count?: number; label?: string }) {
  return (
    <Region label={label} className="grid gap-4">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-1/3 max-w-full" />
            <Skeleton className="h-4 w-2/3 max-w-full" />
            <Skeleton className="h-4 w-1/2 max-w-full" />
          </CardContent>
        </Card>
      ))}
    </Region>
  )
}

/** Detail page: heading, key facts, then section cards. */
export function DetailSkeleton({ sections = 2, label = 'Loading…' }: { sections?: number; label?: string }) {
  return (
    <Region label={label} className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {Array.from({ length: sections }, (_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </Region>
  )
}

/** Week/month calendar grid. */
export function CalendarSkeleton({ label = 'Loading calendar…' }: { label?: string }) {
  return (
    <Region label={label}>
      <div className="grid min-h-64 grid-cols-2 gap-3 lg:min-h-96 lg:grid-cols-7">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-lg border p-3 max-lg:[&:nth-child(n+3)]:hidden">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    </Region>
  )
}

/** Labelled form fields and a submit button. */
export function FormSkeleton({ fields = 4, label = 'Loading…' }: { fields?: number; label?: string }) {
  return (
    <Region label={label} className="space-y-5">
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-9 w-32" />
    </Region>
  )
}

/** Stat tiles, optionally followed by a chart-sized block. */
export function StatTilesSkeleton({ tiles = 3, label = 'Loading…' }: { tiles?: number; label?: string }) {
  return (
    <Region label={label} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: tiles }, (_, index) => (
          <Card key={index}><CardContent className="space-y-3">
            <Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" />
          </CardContent></Card>
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
    </Region>
  )
}

/** Neutral full-page placeholder for route/auth fallbacks (title + content block). */
export function PageSkeleton({ label = 'Loading…' }: { label?: string }) {
  return (
    <Region label={label} className="w-full space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-56 w-full" />
    </Region>
  )
}
