import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'

export default function BackToCalendarLink({ to = '/instructor/calendar' }: { to?: string }) {
  return <Link
    to={to}
    className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
  >
    <ChevronLeft aria-hidden="true" className="size-4" /> Back to calendar
  </Link>
}
