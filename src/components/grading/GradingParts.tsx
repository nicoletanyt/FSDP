import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { InstructorAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardFooter } from '@/components/ui/card'
import { singaporeToday } from '@/lib/grading/format'
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

// One status pill for a grading, used on the schedule and the grading day:
// Not open yet → Applications open → Closed → Completed (or Cancelled).
export function GradingStatusPill({ status = 'scheduled', opensOn = null, closesOn, gradingDate, today = singaporeToday() }: {
  status?: 'scheduled' | 'completed' | 'cancelled'
  opensOn?: string | null
  closesOn: string | null
  gradingDate: string
  today?: string
}) {
  const pill = status === 'cancelled' ? { text: 'Cancelled', className: 'bg-destructive/10 text-destructive' }
    : status === 'completed' || gradingDate < today ? { text: 'Completed', className: 'bg-muted text-muted-foreground' }
    : opensOn && today < opensOn ? { text: 'Not open yet', className: 'border-border bg-background text-muted-foreground' }
    : closesOn && today <= closesOn ? { text: 'Applications open', className: 'bg-success text-success-foreground' }
    : { text: 'Closed', className: 'bg-secondary text-secondary-foreground' }
  return <Badge className={pill.className} data-status-pill>{pill.text}</Badge>
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

// The examiner panel: one chip per examiner with their photo (initials when
// none), the same padding everywhere it appears. The chief is marked once.
export function ExaminerPanel({ panel, viewerIsChief = false, label, photos = {}, heading = true }: {
  panel: PanelExaminer[]
  viewerIsChief?: boolean
  label: string
  photos?: Record<string, string>
  // Compact cards drop the "Examiner panel" heading; the chips speak for themselves.
  heading?: boolean
}) {
  return (
    <div className="space-y-2">
      {heading && <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
        Examiner panel
      </p>}
      {panel.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {panel.map(member => (
            <li key={member.instructorId} data-examiner
              className="inline-flex max-w-full items-center gap-2 rounded-full border bg-background py-1 pr-3 pl-1">
              <InstructorAvatar interactive={false} avatarClassName="size-7" fallbackClassName="text-[11px]"
                profile={{ id: member.instructorId, name: member.name, role: 'Examiner', avatarUrl: photos[member.instructorId] }} />
              {member.isChief && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {viewerIsChief ? 'Chief, you' : 'Chief'}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No examiners assigned yet. Add some so this grading can be marked.</p>
      )}
    </div>
  )
}

// Two or more mutually exclusive views (pressed buttons in one outlined group).
export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; text: string; icon?: LucideIcon }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border bg-background p-0.5">
      {options.map(({ value: option, text, icon: Icon }) => (
        <Button key={option} type="button" size="sm" variant={value === option ? 'secondary' : 'ghost'}
          aria-pressed={value === option} onClick={() => onChange(option)} className="h-9 gap-1.5 px-3">
          {Icon && <Icon className="size-4" aria-hidden="true" />}
          <span className={cn(Icon && 'max-sm:sr-only')}>{text}</span>
        </Button>
      ))}
    </div>
  )
}

// Things on a grading that need an administrator's attention.
export function GradingWarnings({ warnings, quiet = false }: { warnings: string[]; quiet?: boolean }) {
  // Quiet cards say nothing when nothing is wrong.
  if (!warnings.length) return quiet ? null : <span className="text-muted-foreground">Nothing needs attention</span>
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Needs attention">
      {warnings.map(warning => (
        <li key={warning} className="inline-flex items-center gap-1.5 rounded-md bg-warning px-2 py-1 text-xs font-medium text-warning-foreground">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />{warning}
        </li>
      ))}
    </ul>
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
      <div className="min-w-0 text-muted-foreground">{status}</div>
      {children}
    </CardFooter>
  )
}
