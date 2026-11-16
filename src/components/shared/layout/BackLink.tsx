import { createContext, useContext } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'

/**
 * With `history`, a back link returns to the previous page in the app's
 * history; `to` is only the fallback when there is none (opened from a shared
 * link or a new tab), so the link never leaves the app.
 */
function useBackClick(history: boolean | undefined) {
  const navigate = useNavigate()
  // React Router gives the first entry of a session the key "default".
  const hasPrevious = useLocation().key !== 'default'
  return history && hasPrevious
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        // Keep modified clicks (new tab/window) as plain links to the fallback.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        navigate(-1)
      }
    : undefined
}

/** "Back to …" link above a page header, matching the grading and calendar back links. */
export default function BackLink({ to, history, children }: { to: string; history?: boolean; children: ReactNode }) {
  const onClick = useBackClick(history)
  return (
    <Link
      to={to}
      onClick={onClick}
      data-back-link
      className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <ChevronLeft className="size-4" aria-hidden="true" /> {children}
    </Link>
  )
}

type BackTarget = { to: string; label: string; history?: boolean }
const BackContext = createContext<BackTarget | null>(null)

/**
 * A page with a way back. Wider screens: "‹ Back to …" above the header.
 * Phones: the page header shows just ‹ beside its title, on one row, and the
 * text link above is hidden (see [data-back-link] in index.css). Until a
 * header renders (loading, errors) the text link stays as the way back.
 */
export function BackNav({ to, label, history, children }: BackTarget & { children: ReactNode }) {
  return (
    <BackContext value={{ to, label, history }}>
      <BackLink to={to} history={history}>{label}</BackLink>
      {children}
    </BackContext>
  )
}

/** The phone-only ‹ that sits before a page title inside a BackNav; renders nothing outside one. */
export function BackArrow() {
  const back = useContext(BackContext)
  const onClick = useBackClick(back?.history)
  if (!back) return null
  return (
    <Link
      to={back.to}
      onClick={onClick}
      aria-label={back.label}
      data-back-inline
      // 44px target, pulled up and left so the chevron lines up with the title's first line and the page edge.
      className="-my-1.5 -ml-3 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring md:hidden"
    >
      <ChevronLeft className="size-6" aria-hidden="true" />
    </Link>
  )
}
