import { Outlet } from 'react-router'
import PageHeader from '@/components/admin/PageHeader'
import SectionTabs from '@/components/admin/SectionTabs'

const tabs = [
  { to: '/admin/calendar', label: 'Schedule', end: true },
  { to: '/admin/calendar/records', label: 'Records' },
]

export default function Attendance() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader title="Calendar" />
      <SectionTabs label="Calendar sections" tabs={tabs} />
      <Outlet />
    </div>
  )
}
