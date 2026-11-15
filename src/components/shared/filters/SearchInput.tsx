import type { ComponentProps } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * The one search field used across admin, instructor and student pages:
 * 44px tall on touch screens, 40px from `lg`, with the search icon inset 12px.
 */
export default function SearchInput({
  className,
  wrapperClassName,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'> & { wrapperClassName?: string }) {
  return (
    <div className={cn('relative min-w-48 flex-1', wrapperClassName)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input type="search" className={cn('h-11 bg-background pr-3 pl-9 lg:h-10', className)} {...props} />
    </div>
  )
}
