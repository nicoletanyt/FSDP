import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { dashboardPaths } from '@/lib/auth'
import type { UserRole } from '@/lib/auth'

function isInstructorReturnPath(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (['/instructor/check-in', '/instructor/nfc_checkin'].includes(value)) return true
  if (/^\/instructor\/cover\/[0-9a-f-]{36}$/i.test(value)) return true
  return value.startsWith('/instructor/calendar?') && !value.includes('#')
    && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
      new URLSearchParams(value.slice('/instructor/calendar?'.length)).get('cover') ?? '')
}

function isStudentGradingPath(value: unknown): value is string {
  return value === '/grading' || value === '/grading/payment' || value === '/grading/applications'
}

function AuthStatus() {
  const { loading, error, reloadProfile, signOut } = useAuth()
  const { pathname } = useLocation()
  const [signOutError, setSignOutError] = useState('')
  const shell = pathname.startsWith('/instructor') ? 'mx-auto w-full p-4 lg:w-[80%] lg:px-0 lg:py-6' : ''

  if (loading) {
    return (
      <div role="status" className={`flex min-h-48 items-center justify-center gap-2 text-muted-foreground ${shell}`}>
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Loading your account…
      </div>
    )
  }

  return (
    <div className={`mx-auto max-w-lg space-y-4 ${shell}`}>
      <Alert variant="destructive">
        <AlertTitle>Account unavailable</AlertTitle>
        <AlertDescription>{signOutError || error || 'Your account profile is missing.'}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reloadProfile}>Try again</Button>
        <Button variant="outline" onClick={() => {
          void signOut().catch((failure: Error) => setSignOutError(failure.message))
        }}>Sign out</Button>
      </div>
    </div>
  )
}

export function InstructorIndexRedirect() {
  const { session, profile, loading, error } = useAuth()
  const { search } = useLocation()
  if (loading || (session && (error || !profile))) return <AuthStatus />
  return <Navigate to={session && profile?.role === 'instructor'
    ? `${dashboardPaths.instructor}${search}`
    : '/instructor/signin'} replace />
}

export function GuestRoute() {
  const { session, profile, loading, error } = useAuth()
  const location = useLocation()
  if (loading || (session && (error || !profile))) return <AuthStatus />
  if (profile) return <Navigate to={
    profile.role === 'instructor' && isInstructorReturnPath(location.state?.from)
      ? location.state.from
      : profile.role === 'student' && isStudentGradingPath(location.state?.from)
        ? location.state.from : dashboardPaths[profile.role]
  } replace />
  return <Outlet />
}

export function ProtectedRoute({ role }: { role: UserRole }) {
  const { session, profile, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <AuthStatus />
  if (!session) {
    const instructorTarget = location.pathname.startsWith('/instructor/calendar')
      ? location.pathname + location.search : location.pathname
    return <Navigate to={role === 'instructor' ? '/instructor/signin' : role === 'student' ? '/login' : '/staff/login'} state={
      role === 'instructor' && isInstructorReturnPath(instructorTarget)
        ? { from: instructorTarget }
        : role === 'student' && isStudentGradingPath(location.pathname) ? { from: location.pathname } : undefined
    } replace />
  }
  if (error || !profile) return <AuthStatus />
  if (profile.role !== role) return <Navigate to={dashboardPaths[profile.role]} replace />
  return <Outlet />
}
