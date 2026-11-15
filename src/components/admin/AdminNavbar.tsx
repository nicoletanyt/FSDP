import { useRef, useState } from 'react'
import {
  Building2,
  CalendarCheck,
  GraduationCap,
  LayoutDashboard,
  Settings,
  UserCircle,
  UserCog,
  Users,
} from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import logo from '@/assets/logo.png'
import AdminAccountMenu from '@/components/admin/AdminAccountMenu'
import MobileNavigation from '@/components/shared/layout/MobileNavigation'
import OverflowNav from '@/components/shared/layout/OverflowNav'
import ThemeToggle from '@/components/theme-toggle'
import { useAuth } from '@/hooks/use-auth'
import { pageWidth } from '@/lib/page-width'
import { cn } from '@/lib/utils'

const navigation = [
  { label: 'Overview', to: '/admin', icon: LayoutDashboard, end: true },
  { label: 'Calendar', to: '/admin/calendar', icon: CalendarCheck },
  { label: 'Students', to: '/admin/students', icon: Users },
  { label: 'Centres', to: '/admin/centres', icon: Building2 },
  { label: 'Grading', to: '/admin/grading', icon: GraduationCap },
  { label: 'Instructors', to: '/admin/instructors', icon: UserCog },
]

function isActive(pathname: string, to: string, end = false): boolean {
  return end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`)
}

export default function AdminNavbar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const signOutPending = useRef(false)
  const [signOutError, setSignOutError] = useState('')

  async function handleSignOut() {
    if (signOutPending.current) return
    signOutPending.current = true
    setSigningOut(true)
    setSignOutError('')
    try {
      await signOut()
      navigate('/staff/login', { replace: true })
    } catch (failure) {
      setSignOutError(failure instanceof Error ? failure.message : 'Unable to sign out. Try again.')
    } finally {
      signOutPending.current = false
      setSigningOut(false)
    }
  }

  return (
    <>
      <MobileNavigation
        homeTo="/admin"
        links={[
          ...navigation.map(({ label, to, icon, end }) => ({
            label,
            to,
            icon,
            active: isActive(pathname, to, end),
          })),
          { label: 'Settings', to: '/admin/settings', icon: Settings, active: isActive(pathname, '/admin/settings') },
          { label: 'Profile', to: '/admin/profile', icon: UserCircle, active: pathname === '/admin/profile' },
        ]}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        error={signOutError}
      />
      <header className="hidden shrink-0 border-b bg-background lg:block">
        <div
          className={cn(pageWidth, 'flex items-center gap-6 py-5')}
        >
          <Link
            to="/admin"
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
                Administrator
              </p>
            </div>
          </Link>
          <OverflowNav
            label="Administrator navigation"
            items={navigation.map(({ label, to, icon, end }) => ({
              label,
              to,
              icon,
              active: isActive(pathname, to, end),
            }))}
          />
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <AdminAccountMenu />
          </div>
        </div>
      </header>
    </>
  )
}
