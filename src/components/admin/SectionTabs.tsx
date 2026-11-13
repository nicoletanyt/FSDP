import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router'
import CountBadge from '@/components/CountBadge'
import { cn } from 'cn'

export interface SectionTab {
  to: string
  label: string
  /** Match the path exactly, for a section's index tab. */
  end?: boolean
  /** A small count badge after the label; hidden when 0 or unknown. */
  count?: number
}

/**
 * One row of URL-backed tabs under a page header. Tabs are spaced by a gap
 * rather than side padding, so the first label lines up with the page content.
 */
export default function SectionTabs({ label, tabs }: { label: string; tabs: SectionTab[] }) {
  const navRef = useRef<HTMLElement>(null)
  // Fade the right edge only while more tabs are hidden off screen.
  const [moreToRight, setMoreToRight] = useState(false)
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const update = () => setMoreToRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(nav)
    nav.addEventListener('scroll', update, { passive: true })
    return () => { observer.disconnect(); nav.removeEventListener('scroll', update) }
  }, [tabs.length])

  return (
    <nav
      ref={navRef}
      aria-label={label}
      className={cn(
        'flex shrink-0 gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)] [scrollbar-width:none] sm:gap-6',
        moreToRight && '[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]',
      )}
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              'shrink-0 border-b-2 pt-2 pb-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:border-foreground/20 hover:text-foreground',
            )
          }
        >
          <span className="inline-flex items-center gap-1.5">
            {tab.label}
            {tab.count ? <>
              <span className="sr-only">, {tab.count}</span>
              <CountBadge count={tab.count} />
            </> : null}
          </span>
        </NavLink>
      ))}
    </nav>
  )
}
