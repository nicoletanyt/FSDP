import { Suspense, useState } from 'react'
import { Link, Outlet, useMatch } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { dashboardPaths } from '@/lib/auth'

export default function RootLayout() {
  const { session, profile, loading, signOut } = useAuth()
  const isInstructorDashboard = useMatch('/instructor')
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')

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

  return (
    <div className={isInstructorDashboard ? 'flex h-dvh flex-col overflow-hidden bg-muted/30 text-foreground' : 'min-h-screen bg-muted/30 text-foreground'}>
      <header className="shrink-0 border-b bg-background">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link to="/" className="font-semibold hover:underline">
            FSDP
          </Link>
          {!loading && (
            <div className="flex items-center gap-4 text-sm">
              {session ? <>
                {profile && <Link to={dashboardPaths[profile.role]} className="font-medium hover:underline">Dashboard</Link>}
                <Button variant="outline" onClick={handleSignOut} disabled={signingOut}>
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </Button>
              </> : <>
                <Link to="/login" className="hover:underline">Sign in</Link>
                <Link to="/signup" className="font-medium hover:underline">Sign up</Link>
              </>}
            </div>
          )}
        </nav>
        {error && <p role="alert" className="mx-auto max-w-5xl px-6 pb-3 text-sm text-destructive">{error}</p>}
      </header>
      <main className={isInstructorDashboard ? 'mx-auto flex min-h-0 w-[90%] flex-1 flex-col py-4 sm:py-6' : 'mx-auto max-w-5xl px-6 py-12'}>
        <Suspense fallback={<p role="status" className="py-12 text-muted-foreground">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
