import { Link, Outlet } from 'react-router'
import ThemeToggle from '@/components/theme-toggle'

export default function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <nav
          aria-label="Main navigation"
          className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3"
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
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Aikido Shinju-Kai</p>
          <p>FSDP project portal</p>
        </div>
      </footer>
    </div>
  )
}
