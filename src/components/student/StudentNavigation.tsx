import { Link, useLocation } from 'react-router'
import { CalendarDays, ClipboardCheck, CreditCard, LayoutDashboard, Presentation, Receipt, UserCircle } from 'lucide-react'
import logo from '@/assets/logo.png'
import ThemeToggle from '@/components/theme-toggle'
import StudentAccountMenu from '@/components/student/StudentAccountMenu'
import MobileNavigation from '@/components/shared/layout/MobileNavigation'
import OverflowNav from '@/components/shared/layout/OverflowNav'
import { useSignOut } from '@/hooks/use-sign-out'
import { pageWidth } from '@/lib/page-width'
import { cn } from '@/lib/utils'

// Most used first: OverflowNav moves links into "More" from the end.
const routes = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Classes', to: '/classes', icon: Presentation },
  { label: 'My schedule', to: '/timetable', icon: CalendarDays },
  { label: 'Grading', to: '/grading', icon: ClipboardCheck },
  { label: 'Credits', to: '/student/credits', icon: CreditCard },
]

export default function StudentNavigation() {
  const { pathname } = useLocation()
  const { handleSignOut, signingOut, error } = useSignOut()
  const items = routes.map(({ label, to, icon }) => ({
    label,
    to,
    icon,
    active: pathname === to || pathname.startsWith(`${to}/`),
  }))

  return (
    <>
      <MobileNavigation homeTo="/dashboard" links={[
        ...items,
        { label: 'Profile', to: '/profile', icon: UserCircle, active: pathname === '/profile' },
        { label: 'Payments', to: '/payments', icon: Receipt, active: pathname === '/payments' },
      ]} onSignOut={handleSignOut} signingOut={signingOut} error={error} />
      <header className="hidden shrink-0 border-b bg-background lg:block">
        <div className={cn(pageWidth, 'flex items-center gap-6 py-5')}>
          <Link
            to="/dashboard"
            className="flex shrink-0 items-center rounded-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
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
          <OverflowNav label="Student navigation" items={items} />
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <StudentAccountMenu />
          </div>
        </div>
      </header>
    </>
  )
}
