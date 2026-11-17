import { Outlet } from 'react-router'
import PageHeader from '@/components/shared/layout/PageHeader'

export default function Attendance() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* The parent's 16px gap adds to the header's margin; net 16px / 24px like every page. */}
      <PageHeader title="Calendar" className="mb-0 md:mb-2" />
      <Outlet />
    </div>
  )
}
