import { Outlet, useLocation } from 'react-router'
import AdminFilterBar from '@/components/admin/AdminFilterBar'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AdminDataProvider } from '@/lib/admin/admin-data-context'
import { AdminFiltersProvider } from '@/lib/admin/admin-filters'
import { cn } from 'cn'

function AdminShell() {
  const { pathname } = useLocation()
  const isAttendanceRegister =
    pathname === '/admin/attendance' ||
    pathname.startsWith('/admin/attendance/register')
  const showFilters =
    pathname !== '/admin/profile' && !isAttendanceRegister

  return (
    <div
      className={cn(
        'flex flex-1 flex-col',
        isAttendanceRegister && 'lg:h-dvh lg:min-h-0 lg:overflow-hidden',
      )}
    >
      <AdminNavbar />
      <main
        className={cn(
          'mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6',
          isAttendanceRegister
            ? 'flex min-h-0 flex-col lg:overflow-hidden'
            : 'space-y-5',
        )}
      >
        {showFilters && <AdminFilterBar />}
        <Outlet />
      </main>
    </div>
  )
}

export default function AdminLayout() {
  return (
    <AdminDataProvider>
      <AdminFiltersProvider>
        <TooltipProvider>
          <AdminShell />
        </TooltipProvider>
      </AdminFiltersProvider>
    </AdminDataProvider>
  )
}
