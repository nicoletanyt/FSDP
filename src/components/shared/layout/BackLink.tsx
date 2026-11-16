import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'

/** "Back to …" link above a page header, matching the grading and calendar back links. */
export default function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      data-back-link
      className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ChevronLeft className="size-4" aria-hidden="true" /> {children}
    </Link>
  )
}

type BackTarget = { to: string; label: string }
const BackContext = createContext<BackTarget | null>(null)

/**
 * A page with a way back. Wider screens: "‹ Back to …" above the header.
 * Phones: the page header shows just ‹ beside its title, on one row, and the
 * text link above is hidden (see [data-back-link] in index.css). Until a
 * header renders (loading, errors) the text link stays as the way back.
 */
export function BackNav({ to, label, children }: BackTarget & { children: ReactNode }) {
  return (
    <BackContext value={{ to, label }}>
      <BackLink to={to}>{label}</BackLink>
      {children}
    </BackContext>
  )
}

/** The phone-only ‹ that sits before a page title inside a BackNav; renders nothing outside one. */
export function BackArrow() {
  const back = useContext(BackContext)
  if (!back) return null
  return (
    <Link
      to={back.to}
      aria-label={back.label}
      data-back-inline
      // 44px target, pulled up and left so the chevron lines up with the title's first line and the page edge.
      className="-my-1.5 -ml-3 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:hidden"
    >
      <ChevronLeft className="size-6" aria-hidden="true" />
    </Link>
  )
}
