import { Outlet, useLocation } from 'react-router'
import AdminFilterBar from '@/components/admin/AdminFilterBar'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AdminDataProvider } from '@/lib/admin/admin-data-context'
import { AdminFiltersProvider } from '@/lib/admin/admin-filters'
import { cn } from 'cn'

function AdminShell() {
  const { pathname } = useLocation()
  const isCalendar = pathname === '/admin/calendar'
  // The shared filter bar is only used on a student's detail page.
  const showFilters =
    pathname.startsWith('/admin/students/') && pathname !== '/admin/students/attendance'

  return (
    <div
      className={cn(
        'flex flex-1 flex-col',
        isCalendar && 'min-h-0 overflow-hidden',
      )}
    >
      <AdminNavbar />
      <main
        className={cn(
          'mx-auto flex-1',
          isCalendar
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
