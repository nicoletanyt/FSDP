import { Suspense, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import ThemeToggle from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { dashboardPaths } from '@/lib/auth'
import { cn } from 'cn'

export default function RootLayout() {
  const { session, profile, loading, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const location = useLocation()
  const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/')

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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <nav
          aria-label="Main navigation"
          className={cn(
            'mx-auto flex w-full items-center justify-between gap-4 px-6 py-3',
            isAdmin ? 'max-w-[1400px]' : 'max-w-5xl',
          )}
        >
          <Link
            to="/"
            className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <img
              src="/logo.png"
              alt="Aikido Shinju-Kai logo"
              width={40}
              height={40}
              className="size-10 rounded-full"
            />
            <span className="text-base font-semibold tracking-tight">
              <span className="text-primary">Aikido</span>{' '}
              <span className="text-brand-red-ink">Shinju-Kai</span>
            </span>
          </Link>
          <ThemeToggle />
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
        {error && <p role="alert" className={cn('mx-auto px-6 pb-3 text-sm text-destructive', isAdmin ? 'max-w-[1400px]' : 'max-w-5xl')}>{error}</p>}
      </header>
      <main className={cn('mx-auto w-full px-6', isAdmin ? 'max-w-[1400px] py-6' : 'max-w-5xl py-12')}>
        <Suspense fallback={<p role="status" className="py-12 text-muted-foreground">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-border">
        <div
          className={cn(
            'mx-auto flex w-full flex-col gap-1 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between',
            isAdmin ? 'max-w-[1400px]' : 'max-w-5xl',
          )}
        >
          <p>&copy; {new Date().getFullYear()} Aikido Shinju-Kai</p>
          <p>FSDP project portal</p>
        </div>
      </footer>
    </div>
  )
}
