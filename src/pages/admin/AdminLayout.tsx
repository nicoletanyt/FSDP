import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router'
import { DetailSkeleton } from '@/components/shared/skeletons'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AdminDataProvider } from '@/lib/admin/admin-data-context'
import { AdminFiltersProvider } from '@/lib/admin/admin-filters'
import { pageWidth } from '@/lib/page-width'
import { cn } from 'cn'

function AdminShell() {
  const { pathname } = useLocation()
  const isCalendar = pathname === '/admin/calendar'

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
          'flex-1 px-4 text-sm sm:px-6',
          pageWidth,
          isCalendar
            ? 'flex min-h-0 flex-col overflow-hidden py-4 sm:py-6'
            : 'space-y-6 py-6 sm:py-8',
        )}
      >
        <Suspense fallback={<DetailSkeleton label="Loading page…" />}>
          <Outlet />
        </Suspense>
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
