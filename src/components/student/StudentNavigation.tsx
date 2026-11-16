import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { CalendarDays, Coins, GraduationCap, IdCard, LayoutDashboard, QrCode, Receipt, Ticket, UserCircle, Users } from 'lucide-react'
import logo from '@/assets/logo.png'
import ThemeToggle from '@/components/theme-toggle'
import StudentAccountMenu from '@/components/student/StudentAccountMenu'
import MobileNavigation from '@/components/shared/layout/MobileNavigation'
import OverflowNav from '@/components/shared/layout/OverflowNav'
import { buttonVariants } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { useMembershipStatus, type MembershipStatus } from '@/hooks/use-membership-status'
import { useStudentCredits } from '@/hooks/use-student-credits'
import { useSignOut } from '@/hooks/use-sign-out'
import { fetchAttendanceQr } from '@/lib/attendance-qr'
import { pageWidth } from '@/lib/page-width'
import { cn } from '@/lib/utils'

const dashboard = { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard }
const classes = { label: 'Classes', to: '/classes', icon: Users }
const schedule = { label: 'My schedule', to: '/timetable', icon: CalendarDays }
const grading = { label: 'Grading', to: '/grading', icon: GraduationCap }
const credits = { label: 'Credits', to: '/student/credits', icon: Ticket }
const apply = { label: 'Apply for membership', to: '/apply-membership', icon: IdCard }
const renew = { label: 'Renew membership', to: '/apply-membership', icon: IdCard }

/**
 * Members see everything; others see only what they can use, plus the next step.
 * Most used first: OverflowNav moves links into "More" from the end.
 * While the status loads (or if it can't be read) the full set is shown, since
 * most students are members and the pages themselves still check.
 */
export function studentRoutes(status: MembershipStatus | null) {
  if (status === 'none' || status === 'non_member') return [dashboard, classes, schedule, credits, apply]
  if (status === 'pending') return [dashboard, classes]
  // Expired members keep their booking and attendance history.
  if (status === 'expired') return [dashboard, classes, schedule, renew]
  return [dashboard, classes, schedule, grading, credits]
}

/**
 * Whether check-in is open right now (from 10 minutes before a booked class
 * until it ends, as decided by student_attendance_qr), for a shortcut in the
 * phone menu. Re-checks when check-in opens and every minute while it is open,
 * so the shortcut appears on time and disappears after check-in or class end.
 */
function useTodayCheckIn(enabled: boolean) {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (!enabled) {
      setAvailable(false)
      return
    }
    let active = true
    let timer: number | undefined
    const check = () => {
      window.clearTimeout(timer)
      fetchAttendanceQr()
        .then(qr => {
          if (!active) return
          setAvailable(qr.status === 'ready')
          const opensIn = qr.status === 'upcoming' ? Date.parse(qr.opensAt) - Date.now() : NaN
          const delay = qr.status === 'ready' ? 60_000
            : opensIn > 0 && opensIn < 24 * 60 * 60 * 1000 ? opensIn + 1_000
              : null
          if (delay !== null) timer = window.setTimeout(check, delay)
        })
        .catch(() => { if (active) setAvailable(false) })
    }
    check()
    // Background tabs throttle timers, so check again on return.
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled])
  return available
}

export default function StudentNavigation() {
  const { pathname } = useLocation()
  const { handleSignOut, signingOut, error } = useSignOut()
  const { status } = useMembershipStatus()
  const checkIn = useTodayCheckIn(status === 'active' || status === 'non_member')
  const { profile } = useAuth()
  const creditAccount = useStudentCredits(profile?.id, null)
  const balance = creditAccount.unlimited
    ? 'Unlimited pass'
    : creditAccount.error
      ? 'Balance unavailable'
      : creditAccount.loading
        ? 'Loading credits…'
        : `${creditAccount.credits} ${creditAccount.credits === 1 ? 'credit' : 'credits'}`
  const items = studentRoutes(status).map(({ label, to, icon }) => ({
    label,
    to,
    icon,
    active: pathname === to || pathname.startsWith(`${to}/`),
  }))

  return (
    <>
      <MobileNavigation
        homeTo="/dashboard"
        links={items}
        accountLinks={[
          { label: 'Profile', to: '/profile', icon: UserCircle, active: pathname === '/profile' },
          { label: 'Payments', to: '/payments', icon: Receipt, active: pathname === '/payments' },
        ]}
        action={checkIn && (
          <Link to="/dashboard#check-in" className={buttonVariants({ size: 'touch', className: 'mb-2 h-12 w-full gap-2 text-[16px]' })}>
            <QrCode aria-hidden="true" />
            Show check-in QR
          </Link>
        )}
        onSignOut={handleSignOut}
        signingOut={signingOut}
        error={error}
        hideAccountMeta
        accountDetail={(
          <Link
            to="/student/credits"
            // 44px tap target kept; -my-2.5 cancels its empty space so the balance sits right under the name.
            className="-my-2.5 inline-flex min-h-11 items-center gap-1.5 rounded-md text-[16px] font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Coins aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">Credit balance: </span>
            {balance}
          </Link>
        )}
      />
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
