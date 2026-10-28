import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import AdminSidebar from '@/components/admin/AdminSidebar'
import AdminTopbar from '@/components/admin/AdminTopbar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AdminDataProvider } from '@/lib/admin/admin-data-context'
import { AdminFiltersProvider } from '@/lib/admin/admin-filters'

function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <div className="flex gap-6">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-border bg-card">
            <AdminSidebar />
          </div>
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/30"
              aria-label="Close navigation overlay"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-card shadow-xl ring-1 ring-border">
              <AdminSidebar
                onNavigate={() => setMenuOpen(false)}
                onClose={() => setMenuOpen(false)}
              />
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-5">
          <AdminTopbar onOpenMenu={() => setMenuOpen(true)} />
          <Outlet />
        </div>
      </div>
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
