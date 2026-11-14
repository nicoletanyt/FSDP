import { Suspense, useState } from 'react'
import { Link, Outlet, useLocation, useMatch } from 'react-router'
import { LayoutDashboard, LogIn, UserPlus } from 'lucide-react'
import MobileNavigation from '@/components/shared/layout/MobileNavigation'
import StudentNavigation from '@/components/student/StudentNavigation'
import ThemeToggle from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { dashboardPaths } from '@/lib/auth'
import { pageWidth } from '@/lib/page-width'
import { cn } from "@/lib/utils";

export default function RootLayout() {
  const { session, profile, loading, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const { pathname } = useLocation()
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/')
  const isAdminCalendar = pathname === '/admin/calendar'
  const isGradingPayment = pathname === '/grading' || pathname === '/grading/payment'
  const isInstructorPortal = useMatch('/instructor/*')
  const isStudent = Boolean(session && profile?.role === 'student')
  const homePath =
    profile?.role === 'administrator' ? dashboardPaths.administrator : '/'

  async function handleSignOut() {
    setSigningOut(true)
    setError('')
    try {
      await signOut()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign out.')
    } finally {
      setSigningOut(false)
    }
  }

  const mobileLinks = session
    ? profile
      ? [
          {
            label: 'Dashboard',
            to: dashboardPaths[profile.role],
            icon: LayoutDashboard,
            active: pathname === dashboardPaths[profile.role],
          },
        ]
      : []
    : [
        {
          label: 'Sign in',
          to: '/login',
          icon: LogIn,
          active: pathname === '/login' || pathname === '/staff/login',
        },
        {
          label: 'Sign up',
          to: '/signup',
          icon: UserPlus,
          active: pathname === '/signup',
        },
      ]

  if (isInstructorPortal) {
    return (
      <Suspense
        fallback={
          <p
            role="status"
            className="mx-auto w-full p-6 text-muted-foreground lg:w-[80%] lg:px-0 lg:py-6"
          >
            Loading…
          </p>
        }
      >
        <Outlet />
      </Suspense>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col text-foreground',
        isAdminCalendar ? 'h-dvh overflow-hidden' : 'min-h-screen',
        isAdmin ? 'bg-muted/30' : 'bg-background',
      )}
    >
      {isStudent ? (
        <StudentNavigation />
      ) : (
        !isAdmin && (
          <>
            <MobileNavigation
              loading={loading}
              links={mobileLinks}
              onSignOut={session ? handleSignOut : undefined}
              signingOut={signingOut}
              error={error}
            />
            <header className="sticky top-0 z-40 hidden border-b border-border bg-background/90 backdrop-blur lg:block">
              <nav
                aria-label="Main navigation"
                className={cn(pageWidth, "flex flex-wrap items-center justify-between gap-y-2 px-4 py-3 lg:gap-4 lg:py-5")}
              >
                <Link
                  to={homePath}
                  className="flex min-h-11 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-h-0"
                >
                  <img
                    src="/logo.png"
                    alt="Aikido Shinju-Kai logo"
                    width={40}
                    height={40}
                    className="size-8 rounded-full lg:size-10"
                  />
                  <span className="text-xs font-semibold tracking-tight lg:text-base">
                    <span className="text-primary">Aikido</span>{' '}
                    <span className="text-brand-red-ink">Shinju-Kai</span>
                  </span>
                </Link>
                <div className="flex items-center gap-0 lg:gap-4">
                  <ThemeToggle />
                  {!loading && (
                    <div className="hidden items-center gap-4 text-sm lg:flex">
                      {session ? (
                        <>
                          {profile && (
                            <Link
                              to={dashboardPaths[profile.role]}
                              className="font-medium hover:underline"
                            >
                              Dashboard
                            </Link>
                          )}
                          <Button
                            variant="outline"
                            onClick={handleSignOut}
                            disabled={signingOut}
                          >
                            {signingOut ? 'Signing out…' : 'Sign out'}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Link to="/login" className="hover:underline">
                            Sign in
                          </Link>
                          <Link
                            to="/signup"
                            className="font-medium hover:underline"
                          >
                            Sign up
                          </Link>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </nav>
              {error && (
                <p
                  role="alert"
                  className={cn(pageWidth, "px-4 pb-3 text-sm break-words text-destructive")}
                >
                  {error}
                </p>
              )}
            </header>
          </>
        )
      )}
      {isAdmin ? (
        <Suspense
          fallback={
            <p
              role="status"
              className="px-4 py-12 text-muted-foreground sm:px-6"
            >
              Loading…
            </p>
          }
        >
          <Outlet />
        </Suspense>
      ) : (
        <main
          className={cn(
            'mx-auto w-full',
            isGradingPayment ? 'p-0' : cn('p-6', pageWidth),
            !isGradingPayment && (isStudent ? 'lg:py-8' : 'lg:py-12'),
          )}
        >
          <Suspense
            fallback={
              <p role="status" className="py-12 text-muted-foreground">
                Loading…
              </p>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      )}
      {!isAdmin && (
        <div aria-hidden="true" className="h-24 shrink-0 lg:hidden" />
      )}
    </div>
  )
}
