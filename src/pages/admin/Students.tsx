import { Outlet } from 'react-router'
import PageHeader from '@/components/shared/layout/PageHeader'
import SectionTabs from '@/components/shared/layout/SectionTabs'
import { useAtRiskCount } from '@/lib/admin/section-counts'

const baseTabs = [
  { to: '/admin/students', label: 'All students', end: true },
  { to: '/admin/students/attendance', label: 'Attendance watch' },
]

export default function Students() {
  const count = useAtRiskCount()
  const tabs = baseTabs.map(tab => tab.to === '/admin/students/attendance' ? { ...tab, count } : tab)
  return (
    <div className="space-y-6">
      <PageHeader title="Students" />
      <SectionTabs tabs={tabs} label="Student sections" />
      <Outlet />
    </div>
  )
}
