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
  return (
    <nav
      aria-label={label}
      className="flex shrink-0 gap-6 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-border)] [scrollbar-width:none] sm:gap-8"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              'shrink-0 border-b-2 py-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
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
