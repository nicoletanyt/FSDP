import { GraduationCap } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router'
import PageHeader from '@/components/admin/PageHeader'
import { Button } from '@/components/ui/button'
import { cn } from 'cn'

const tabs = [
  { to: 'eligibility', label: 'Eligibility' },
  { to: 'opportunities', label: 'Opportunities' },
  { to: 'applications', label: 'Applications' },
]

export default function Grading() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Grading"
        title="Grading pipeline"
        description="See who is eligible, create grading opportunities, notify students, and monitor submitted applications."
        actions={
          <Button render={<Link to="/admin/grading/opportunities" />}>
            <GraduationCap />
            New opportunity
          </Button>
        }
      />
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
