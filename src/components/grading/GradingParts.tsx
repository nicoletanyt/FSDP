import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CardFooter } from '@/components/ui/card'
import { cn } from 'cn'

// Building blocks shared by the instructor and admin grading pages, so both
// sides use one type scale, one spacing rhythm and one way to show each fact.

export function GradingBackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to}
      className="inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">
      <ChevronLeft className="size-4" aria-hidden="true" /> {children}
    </Link>
  )
}

export interface GradingFact {
  key: string
  icon: LucideIcon
  label: ReactNode
}

// One line of icon-labelled facts (date, time, place, candidates).
export function GradingFacts({ items, className }: { items: GradingFact[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground', className)}>
      {items.map(({ key, icon: Icon, label }) => (
        <li key={key} className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
        </li>
      ))}
    </ul>
  )
}

export function GradingStatusBadge({ status }: { status: 'scheduled' | 'completed' | 'cancelled' }) {
  if (status === 'scheduled') return null
  return <Badge variant="secondary">{status === 'cancelled' ? 'Cancelled' : 'Completed'}</Badge>
}

// Page title row: title with its badges, the facts beneath, actions to the right.
export function GradingPageHeader({ title, badges, facts, actions, children }: {
  title: ReactNode
  badges?: ReactNode
  facts?: GradingFact[]
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{title}</h1>
          {badges}
        </div>
        {facts && <GradingFacts items={facts} />}
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export interface PanelExaminer {
  instructorId: string
  name: string
  isChief: boolean
}

// The examiner panel as name chips; the chief is marked once.
export function ExaminerPanel({ panel, viewerIsChief = false, label }: {
  panel: PanelExaminer[]
  viewerIsChief?: boolean
  label: string
}) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        Examiner panel
      </p>
      {panel.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {panel.map(member => (
            <li key={member.instructorId} className="rounded-md border bg-background px-2 py-0.5 text-xs">
              <span className="font-semibold">{member.name}</span>
              {member.isChief && <span className="text-muted-foreground">{viewerIsChief ? ' · Chief (you)' : ' · Chief'}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No examiners assigned yet, so nobody can grade this session.</p>
      )}
    </div>
  )
}

// A bordered note for empty or blocked states inside a page section.
export function GradingNote({ children, role }: { children: ReactNode; role?: 'alert' | 'status' }) {
  return <p role={role} className="rounded-lg border p-4 text-sm text-muted-foreground">{children}</p>
}

// The card footer's call to action, styled the same on every grading card.
export const gradingActionClass =
  'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

// Card footer: a short status on the left, the card's one action on the right.
export function GradingCardFooter({ status, children }: { status: ReactNode; children: ReactNode }) {
  return (
    <CardFooter className="flex-wrap justify-between gap-3 py-3">
      <p className="text-muted-foreground">{status}</p>
      {children}
    </CardFooter>
  )
}
