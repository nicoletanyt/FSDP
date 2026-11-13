import { Outlet } from 'react-router'
import PageHeader from '@/components/admin/PageHeader'
import SectionTabs from '@/components/admin/SectionTabs'

const tabs = [
  { to: '/admin/settings/email-templates', label: 'Email templates' },
  { to: '/admin/settings/email-log', label: 'Email log' },
  { to: '/admin/settings/syllabus', label: 'Syllabus' },
  { to: '/admin/settings/grading-rules', label: 'Grading rules' },
]

export default function Settings() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <SectionTabs label="Settings sections" tabs={tabs} />
      <Outlet />
    </div>
  )
}
