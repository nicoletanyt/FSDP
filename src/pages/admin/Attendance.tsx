import { NavLink, Outlet } from 'react-router'
import { cn } from 'cn'

const tabs = [
  { to: 'register', label: 'Register' },
  { to: 'sessions', label: 'Sessions' },
  { to: 'records', label: 'Records' },
  { to: 'monitoring', label: 'Monitoring' },
]

export default function Attendance() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <nav
        aria-label="Attendance sections"
        className="flex shrink-0 flex-wrap gap-1 border-b border-border"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
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
      <Outlet />
    </div>
  )
}
