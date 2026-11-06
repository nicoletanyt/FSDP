import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { dashboardPaths } from '@/lib/auth'
import type { UserRole } from '@/lib/auth'

function AuthStatus() {
  const { loading, error, reloadProfile, signOut } = useAuth()
  const { pathname } = useLocation()
  const [signOutError, setSignOutError] = useState('')
  const shell = pathname.startsWith('/instructor') ? 'mx-auto w-full p-4 lg:w-[70%] lg:px-0 lg:py-6' : ''

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
    profile.role === 'instructor' && location.state?.from === '/instructor/check-in'
      ? '/instructor/check-in'
      : profile.role === 'student' && location.state?.from === '/grading'
        ? '/grading' : dashboardPaths[profile.role]
  } replace />
  return <Outlet />
}

export function ProtectedRoute({ role }: { role: UserRole }) {
  const { session, profile, loading, error } = useAuth()
  const location = useLocation()
  if (loading) return <AuthStatus />
  if (!session) {
    return <Navigate to={role === 'instructor' ? '/instructor/signin' : role === 'student' ? '/login' : '/staff/login'} state={
      role === 'instructor' && location.pathname === '/instructor/check-in' ? { from: '/instructor/check-in' }
        : role === 'student' && location.pathname === '/grading' ? { from: '/grading' } : undefined
    } replace />
  }
  if (error || !profile) return <AuthStatus />
  if (profile.role !== role) return <Navigate to={dashboardPaths[profile.role]} replace />
  return <Outlet />
}
