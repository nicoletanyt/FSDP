import { cn } from '@/lib/utils'

/** The small round count used on Filter buttons and section tabs. */
export default function CountBadge({ count, className }: { count: number; className?: string }) {
  const label = count > 99 ? '99+' : String(count)
  return (
    <span
      aria-hidden="true"
      className={cn(
        'directory-filter-count flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground',
        label.length > 1 && 'w-auto min-w-5 px-1',
        className,
      )}
    >
      {label}
    </span>
  )
}
