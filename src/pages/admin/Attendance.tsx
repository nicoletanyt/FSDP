import { CalendarCheck } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import PageHeader from '@/components/admin/PageHeader'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'

const tabs = [
  { to: 'register', label: 'Register' },
  { to: 'sessions', label: 'Sessions' },
  { to: 'records', label: 'Records' },
  { to: 'monitoring', label: 'Monitoring' },
]

export default function Attendance() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Monitor"
        title="Attendance"
        description="Record classes, review history, and follow up with students whose attendance is declining across centres."
        actions={
          <Button render={<Link to="/admin/attendance/register" />}>
            <CalendarCheck />
            Record attendance
          </Button>
        }
      />
      <nav aria-label="Attendance sections" className="flex flex-wrap gap-1 border-b border-border">
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
