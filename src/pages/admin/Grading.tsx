import { Outlet } from 'react-router'
import PageHeader from '@/components/admin/PageHeader'
import SectionTabs from '@/components/admin/SectionTabs'

const tabs = [
  { to: '/admin/grading/opportunities', label: 'Schedule' },
  { to: '/admin/grading/applications', label: 'Applications' },
  { to: '/admin/grading/eligibility', label: 'Eligibility' },
]

export default function Grading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Grading" />
      <SectionTabs label="Grading sections" tabs={tabs} />
      <Outlet />
    </div>
  )
}
