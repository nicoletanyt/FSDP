import { Outlet } from 'react-router'
import PageHeader from '@/components/admin/PageHeader'
import SectionTabs from '@/components/admin/SectionTabs'

const tabs = [
  { to: '/admin/students', label: 'All students', end: true },
  { to: '/admin/students/attendance', label: 'Attendance watch' },
]

export default function Students() {
  return (
    <div className="space-y-6">
      <PageHeader title="Students" />
      <SectionTabs label="Student sections" tabs={tabs} />
      <Outlet />
    </div>
  )
}
