import { NavLink, Outlet } from 'react-router'
import PageHeader from '@/components/admin/PageHeader'
import { cn } from 'cn'

const tabs = [
  { to: 'opportunities', label: 'Schedule' },
  { to: 'eligibility', label: 'Eligibility' },
  { to: 'applications', label: 'Applications' },
  { to: 'syllabus', label: 'Syllabus' },
]

export default function Grading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Grading" />
      <nav aria-label="Grading sections" className="flex flex-wrap gap-1 border-b border-border">
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
