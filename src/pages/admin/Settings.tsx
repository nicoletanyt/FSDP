import { Outlet } from 'react-router'
import PageHeader from '@/components/admin/PageHeader'
import SectionTabs from '@/components/admin/SectionTabs'

const tabs = [
  { to: '/admin/settings/email-templates', label: 'Emails' },
  { to: '/admin/settings/email-log', label: 'Sent emails' },
  { to: '/admin/settings/grading-rules', label: 'Grading schedule' },
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
