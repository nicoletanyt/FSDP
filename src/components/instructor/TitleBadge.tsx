import { instructorTitleLabels } from '@/lib/instructor/titles'
import type { AwardedInstructorTitle } from '@/lib/instructor/titles'
import { cn } from 'cn'

export default function TitleBadge({ title, className }: {
  title: AwardedInstructorTitle
  className?: string
}) {
  const label = instructorTitleLabels[title]
  return <span data-slot="title-badge" data-title={title} title={`${label} · Aikikai instructor title`}
    className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-2xs text-foreground', className)}>
    <span className="font-semibold whitespace-nowrap">{label}</span>
  </span>
}
