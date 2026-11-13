import { Outlet } from 'react-router'
import PageHeader from '@/components/shared/layout/PageHeader'

export default function Attendance() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <PageHeader title="Calendar" />
      <Outlet />
    </div>
  )
}
