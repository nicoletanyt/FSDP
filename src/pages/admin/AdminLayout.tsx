import { Outlet, useLocation, useSearchParams } from 'react-router'
import AdminFilterBar from '@/components/admin/AdminFilterBar'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AdminDataProvider } from '@/lib/admin/admin-data-context'
import { AdminFiltersProvider } from '@/lib/admin/admin-filters'
import { cn } from 'cn'

function AdminShell() {
  const { pathname } = useLocation()
  const [searchParams] = useSearchParams()
  const isAttendanceRegister =
    pathname === '/admin/attendance' ||
    pathname.startsWith('/admin/attendance/register')
  const isDojosTab =
    pathname === '/admin/centres' && searchParams.get('tab') !== 'students'
  const showFilters =
    pathname !== '/admin/profile' && !isAttendanceRegister && !isDojosTab

  return (
    <div
      className={cn(
        'flex flex-1 flex-col',
        isAttendanceRegister && 'min-h-0 overflow-hidden',
      )}
    >
      <AdminNavbar />
      <main
        className={cn(
          'mx-auto flex-1',
          isAttendanceRegister
            ? 'flex min-h-0 w-[calc(100%-2rem)] max-w-[1600px] flex-col overflow-hidden py-4 sm:w-[94%] sm:py-6'
            : 'w-full max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8',
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
