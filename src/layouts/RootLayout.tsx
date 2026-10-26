import { Link, Outlet } from 'react-router'

export default function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Main navigation" className="mx-auto max-w-5xl px-6 py-4">
          <Link to="/" className="font-semibold hover:underline">
            FSDP
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-12">
        <Outlet />
      </main>
    </div>
  )
}
