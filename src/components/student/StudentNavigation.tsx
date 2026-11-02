import { Link, NavLink } from 'react-router'
import { CalendarDays, ClipboardCheck, LayoutDashboard, Presentation, UserCheck } from 'lucide-react'
import logo from '@/assets/logo.png'
import ThemeToggle from '@/components/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

const routes = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Timetable', to: '/timetable', icon: CalendarDays },
  { label: 'Attendance', to: '/attendance', icon: UserCheck },
  { label: 'Classes', to: '/classes', icon: Presentation },
  { label: 'Grading', to: '/grading', icon: ClipboardCheck },
]

export default function StudentNavigation() {
  const { profile } = useAuth()
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Student'
  const initials = [profile?.first_name, profile?.last_name]
    .map(name => name?.trim()[0] ?? '')
    .join('')
    .toUpperCase() || 'S'

  return <header className="shrink-0 border-b bg-background">
    <div className="mx-auto flex w-[80%] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-5">
      <Link
        to="/dashboard"
        className="flex items-center rounded-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
      >
        <img
          src={logo}
          alt="Aikido Shinju-Kai logo"
          className="size-10 shrink-0 object-contain"
          width={40}
          height={40}
        />
        <div className="relative ml-2 leading-tight">
          <p className="whitespace-nowrap text-base">
            <span className="text-primary">Aikido</span>{' '}
            <span className="text-brand-red-ink">Shinju-Kai</span>
          </p>
          <p className="mt-0.5 text-3xs leading-none font-normal tracking-normal text-muted-foreground">
            Student
          </p>
        </div>
      </Link>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
        <nav
          aria-label="Student navigation"
          className="order-3 flex w-full flex-wrap items-center gap-1 lg:order-0 lg:w-auto"
        >
          {routes.map(({ label, to, icon: Icon }) => <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) => cn(
              'flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:px-3 sm:text-sm lg:flex-none',
              isActive && 'bg-accent text-accent-foreground',
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </NavLink>)}
        </nav>
        <ThemeToggle />
        <NavLink
          to="/profile"
          aria-label={`View profile for ${name}`}
          title="Membership Profile"
          className={({ isActive }) => cn(
            'flex size-10 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
            isActive && 'bg-accent',
          )}
        >
          <Avatar aria-hidden="true" className="size-7">
            <AvatarFallback className="font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </NavLink>
      </div>
    </div>
  </header>
}
