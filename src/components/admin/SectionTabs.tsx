import { NavLink } from 'react-router'
import { cn } from 'cn'

export interface SectionTab {
  to: string
  label: string
  /** Match the path exactly, for a section's index tab. */
  end?: boolean
}

/** One row of URL-backed tabs under a page header. */
export default function SectionTabs({ label, tabs }: { label: string; tabs: SectionTab[] }) {
  return (
    <nav aria-label={label} className="flex shrink-0 flex-wrap gap-1 border-b border-border">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
