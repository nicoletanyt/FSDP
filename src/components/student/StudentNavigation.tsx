import { Link, useLocation } from 'react-router'
import { CalendarDays, ClipboardCheck, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'

const routes = [
  { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Browse classes', path: '/dashboard/classes', icon: CalendarDays },
  { label: 'My schedule & attendance', path: '/dashboard/attendance', icon: ClipboardCheck },
]
export default function StudentNavigation() {
  const { pathname } = useLocation()
  return <nav aria-label="Student portal navigation" className="flex flex-wrap gap-2 border-b pb-4">
    {routes.map(({ label, path, icon: Icon }) => <Link key={path} to={path}
      aria-current={pathname === path ? 'page' : undefined}
      className={cn('inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', pathname === path && 'bg-accent text-accent-foreground')}>
      <Icon aria-hidden="true" className="size-4" />{label}</Link>)}
  </nav>
}
