import { Outlet } from 'react-router'
import PageHeader from '@/components/shared/layout/PageHeader'
import SectionTabs from '@/components/shared/layout/SectionTabs'
import { useEligibleCount } from '@/lib/admin/section-counts'

const baseTabs = [
  { to: '/admin/grading/opportunities', label: 'Schedule' },
  { to: '/admin/grading/applications', label: 'Applications' },
  { to: '/admin/grading/eligibility', label: 'Eligibility' },
  { to: '/admin/grading/belt-requirements', label: 'Belt requirements' },
]

export default function Grading() {
  const count = useEligibleCount()
  const tabs = baseTabs.map(tab => tab.to === '/admin/grading/eligibility' ? { ...tab, count } : tab)
  return (
    <div className="space-y-6">
      <PageHeader title="Grading" />
      <SectionTabs tabs={tabs} label="Grading sections" />
      <Outlet />
    </div>
  )
}
