import { belts } from '@/lib/student-grades'
import type { GradeRow } from '@/lib/instructor/types'
import { cn } from 'cn'

export default function DatabaseGradeBadge({ grade, showBeltLabel = false, className }: {
  grade: GradeRow | null
  showBeltLabel?: boolean
  className?: string
}) {
  const colour = grade?.colour?.toLowerCase()
  const belt = colour && Object.hasOwn(belts, colour) ? belts[colour as keyof typeof belts] : null
  const label = grade?.label ?? 'Grade not recorded'
  return <span data-slot="grade-badge" data-grade-id={grade?.id} title={`${label}${grade?.colour ? ` · ${grade.colour}` : ''}`}
    className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-2xs text-foreground', showBeltLabel && 'flex-wrap', className)}>
    <span className="font-semibold whitespace-nowrap">{label}</span>
    {grade?.colour && <>
      {belt && <span aria-hidden="true" className={cn('h-2 w-4 shrink-0 rounded-xs border', belt.indicator)} />}
      <span className={showBeltLabel ? 'text-xs font-normal opacity-75' : 'sr-only'}>{showBeltLabel ? '' : ' · '}{grade.colour}</span>
    </>}
  </span>
}
