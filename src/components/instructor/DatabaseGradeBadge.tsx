import { belts } from '@/lib/student-grades'
import type { GradeRow } from '@/lib/instructor/types'
import { cn } from 'cn'

// The belt swatch for a database grade, from its colour. Null when unknown.
export function beltFor(grade: Pick<GradeRow, 'colour'> | null) {
  const colour = grade?.colour?.toLowerCase()
  return colour && Object.hasOwn(belts, colour) ? belts[colour as keyof typeof belts] : null
}

type BadgeGrade = Pick<GradeRow, 'id' | 'label' | 'colour'>

const capitalise = (word: string) => word ? word[0].toUpperCase() + word.slice(1) : word

/** A grade from its database id (e.g. "blue-gold-5th-kyu" → "Blue-Gold (5th Kyu)"). */
export function gradeFromId(id: string | null | undefined): BadgeGrade | null {
  if (!id || id === 'unranked') return id ? { id, label: 'Unranked', colour: null } : null
  const kyu = id.match(/^(.*)-(\d+(?:st|nd|rd|th))-kyu$/)
  if (kyu) {
    const colour = kyu[1].split('-').map(capitalise).join('-')
    return { id, label: `${colour} (${kyu[2]} Kyu)`, colour }
  }
  return { id, label: id.split('-').map(capitalise).join(' '), colour: 'Black' }
}

export default function DatabaseGradeBadge({ grade, showBeltLabel = false, className }: {
  grade: BadgeGrade | null
  showBeltLabel?: boolean
  className?: string
}) {
  const belt = beltFor(grade)
  const label = grade?.label ?? 'Grade not recorded'
  const rank = belt ? label.match(/\(([^()]*(?:Kyu|Dan)[^()]*)\)$/i)?.[1] ?? label : label
  return <span data-slot="grade-badge" data-grade-id={grade?.id} title={`${label}${grade?.colour ? ` · ${grade.colour}` : ''}`}
    className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-2xs text-foreground', showBeltLabel && 'flex-wrap', className)}>
    <span className="font-semibold whitespace-nowrap">{rank}</span>
    {grade?.colour && <>
      {belt && <span aria-hidden="true" className={cn('order-first size-3 shrink-0 rounded-xs border', belt.indicator)} />}
      <span className={showBeltLabel ? 'text-xs font-normal opacity-75' : 'sr-only'}>{showBeltLabel ? '' : ' · '}{grade.colour}</span>
    </>}
  </span>
}
