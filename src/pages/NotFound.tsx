import { Link } from 'react-router'

export default function NotFound() {
  return (
    <section>
      <h1 className="text-3xl font-bold">404 — Page not found</h1>
      <p className="mt-4 text-slate-600">The page you requested does not exist.</p>
      <Link to="/" className="mt-6 inline-block text-blue-700 underline">
        Back to home
      </Link>
    </section>
  )
}
