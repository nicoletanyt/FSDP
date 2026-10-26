import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Navigate, Outlet } from 'react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { dashboardPaths } from '@/lib/auth'
import type { UserRole } from '@/lib/auth'

function AuthStatus() {
  const { loading, error, reloadProfile, signOut } = useAuth()
  const [signOutError, setSignOutError] = useState('')

  if (loading) {
    return (
      <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Loading your account…
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Alert variant="destructive">
        <AlertTitle>Account unavailable</AlertTitle>
        <AlertDescription>{signOutError || error || 'Your account profile is missing.'}</AlertDescription>
      </Alert>
      <div className="flex gap-3">
        <Button onClick={reloadProfile}>Try again</Button>
        <Button variant="outline" onClick={() => {
          void signOut().catch((failure: Error) => setSignOutError(failure.message))
        }}>Sign out</Button>
      </div>
    </div>
  )
}

export function GuestRoute() {
  const { session, profile, loading, error } = useAuth()
  if (loading || (session && (error || !profile))) return <AuthStatus />
  if (profile) return <Navigate to={dashboardPaths[profile.role]} replace />
  return <Outlet />
}

export function ProtectedRoute({ role }: { role: UserRole }) {
  const { session, profile, loading, error } = useAuth()
  if (loading) return <AuthStatus />
  if (!session) {
    return <Navigate to={role === 'student' ? '/login' : '/staff/login'} replace />
  }
  if (error || !profile) return <AuthStatus />
  if (profile.role !== role) return <Navigate to={dashboardPaths[profile.role]} replace />
  return <Outlet />
}
