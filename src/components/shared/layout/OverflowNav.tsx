import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface OverflowNavItem {
  label: string
  to: string
  icon: LucideIcon
  active: boolean
}

const GAP = 4 // matches gap-1
const itemClass =
  'flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring'
const activeClass = 'bg-accent text-accent-foreground'

/**
 * A row of nav links that moves whatever does not fit into a "More" popover.
 * Links overflow from the end, so put the most used ones first.
 */
export default function OverflowNav({ label, items }: { label: string; items: OverflowNavItem[] }) {
  const { pathname, search } = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(items.length)
  const [open, setOpen] = useState(false)

  useEffect(() => { setOpen(false) }, [pathname, search])

  useLayoutEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return

    function compute() {
      const available = container!.clientWidth
      const widths = [...measure!.children].map((child) => child.getBoundingClientRect().width)
      const moreWidth = widths.pop() ?? 0
      const total = widths.reduce((sum, width) => sum + width, 0) + GAP * (widths.length - 1)
      if (total <= available) {
        setVisibleCount(widths.length)
        return
      }
      let used = moreWidth
      let count = 0
      for (const width of widths) {
        if (used + GAP + width > available) break
        used += GAP + width
        count++
      }
      setVisibleCount(count)
    }

    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(container)
    observer.observe(measure)
    return () => observer.disconnect()
  }, [items.length])

  const visible = items.slice(0, visibleCount)
  const overflow = items.slice(visibleCount)
  const overflowActive = overflow.some((item) => item.active)

  return (
    <div ref={containerRef} className="flex min-w-0 flex-1 justify-end">
      {/* Off-screen copy used only to measure each link's natural width. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible fixed top-0 left-0 flex gap-1"
      >
        {items.map(({ label: itemLabel, to, icon: Icon }) => (
          <span key={to} className={itemClass}>
            <Icon className="size-4" />
            {itemLabel}
          </span>
        ))}
        <span className={itemClass}>
          More
          <ChevronDown className="size-4" />
        </span>
      </div>

      <nav aria-label={label} className="flex items-center gap-1">
        {visible.map(({ label: itemLabel, to, icon: Icon, active }) => (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={cn(itemClass, active && activeClass)}
          >
            <Icon aria-hidden="true" className="size-4" />
            {itemLabel}
          </Link>
        ))}
        {overflow.length > 0 && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger className={cn(itemClass, 'cursor-pointer', (open || overflowActive) && activeClass)}>
              More
              <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform', open && 'rotate-180')} />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 gap-1 p-2">
              <PopoverTitle className="sr-only">More pages</PopoverTitle>
              {overflow.map(({ label: itemLabel, to, icon: Icon, active }) => (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(itemClass, 'min-h-11 w-full', active && activeClass)}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {itemLabel}
                </Link>
              ))}
            </PopoverContent>
          </Popover>
        )}
      </nav>
    </div>
  )
}
