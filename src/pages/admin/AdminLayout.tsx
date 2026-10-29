import { Outlet, useLocation } from 'react-router'
import AdminFilterBar from '@/components/admin/AdminFilterBar'
import AdminNavbar from '@/components/admin/AdminNavbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AdminDataProvider } from '@/lib/admin/admin-data-context'
import { AdminFiltersProvider } from '@/lib/admin/admin-filters'

function AdminShell() {
  const { pathname } = useLocation()
  const showFilters = pathname !== '/admin/profile'

  return (
    <div className="flex flex-1 flex-col">
      <AdminNavbar />
      <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-5 px-4 py-6 sm:px-6">
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
