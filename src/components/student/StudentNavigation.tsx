import { Link, NavLink, useLocation } from 'react-router'
import { ClipboardCheck, CreditCard, LayoutDashboard, Presentation, UserCheck, UserCircle } from 'lucide-react'
import logo from '@/assets/logo.png'
import ThemeToggle from '@/components/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import MobileNavigation from '@/components/MobileNavigation'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

const routes = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Credits', to: '/student/credits', icon: CreditCard },
  { label: 'Timetable', to: '/timetable', icon: UserCheck },
  { label: 'Classes', to: '/classes', icon: Presentation },
  { label: 'Grading', to: '/grading', icon: ClipboardCheck },
]

export default function StudentNavigation() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Student'
  const initials = [profile?.first_name, profile?.last_name]
    .map(name => name?.trim()[0] ?? '')
    .join('')
    .toUpperCase() || 'S'

  return <>
    <MobileNavigation homeTo="/dashboard" links={[
      ...routes.map(({ label, to, icon }) => ({ label, to, icon, active: pathname === to })),
      { label: 'Profile', to: '/profile', icon: UserCircle, active: pathname === '/profile' },
    ]} />
    <header className="hidden shrink-0 border-b bg-background lg:block">
    <div className="mx-auto flex w-[calc(100%-2rem)] flex-wrap items-center gap-y-2 py-3 lg:w-[80%] lg:justify-between lg:gap-x-6 lg:gap-y-3 lg:px-6 lg:py-5">
      <Link
        to="/dashboard"
        className="mr-auto flex min-h-11 items-center rounded-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring lg:mr-0 lg:min-h-0"
      >
        <img
          src={logo}
          alt="Aikido Shinju-Kai logo"
          className="size-8 shrink-0 object-contain lg:size-10"
          width={40}
          height={40}
        />
        <div className="relative ml-2 leading-tight">
          <p className="whitespace-nowrap text-xs lg:text-base">
            <span className="text-primary">Aikido</span>{' '}
            <span className="text-brand-red-ink">Shinju-Kai</span>
          </p>
          <p className="mt-0.5 text-3xs leading-none font-normal tracking-normal text-muted-foreground">
            Student
          </p>
        </div>
      </Link>
      <div className="contents lg:flex lg:min-w-0 lg:flex-wrap lg:items-center lg:justify-between lg:gap-1">
        <nav
          aria-label="Student navigation"
          className="hidden flex-wrap items-center gap-1 lg:flex"
        >
          {routes.map(({ label, to, icon: Icon }) => <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) => cn(
              'flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:gap-2 sm:px-3 sm:text-sm lg:min-h-10 lg:flex-none',
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
            'hidden size-10 items-center justify-center rounded-lg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring lg:flex',
            isActive && 'bg-accent',
          )}
        >
          <Avatar aria-hidden="true" className="size-7">
            <AvatarFallback className="font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </NavLink>
      </div>
    </div>
  </header></>
}
