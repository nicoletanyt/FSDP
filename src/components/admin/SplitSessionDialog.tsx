import { useState } from 'react'
import { DatabaseGradeBadge } from '@/components/shared/grade/GradeBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { sessionLabel } from '@/lib/instructor/grading-panels'
import type { GradingSessionSummary } from '@/lib/instructor/grading-panels'

// Choose which candidates leave a session for a new one straight after it.
export default function SplitSessionDialog({ session, open, onOpenChange, onSplit, busy }: {
  session: GradingSessionSummary
  open: boolean
  onOpenChange: (open: boolean) => void
  onSplit: (applicationIds: string[]) => void
  busy: boolean
}) {
  const [chosen, setChosen] = useState<string[]>([])
  const people = session.grades.flatMap(group => group.candidates.map(candidate => ({ candidate, grade: group.grade })))
  const label = sessionLabel(session.position)
  const toggle = (id: string, on: boolean) => setChosen(current => on ? [...current, id] : current.filter(item => item !== id))
  // Whole target grades are the usual split, so offer them as one click.
  const chooseGrade = (gradeId: string) => setChosen(session.grades.find(group => group.grade.id === gradeId)!
    .candidates.map(candidate => candidate.applicationId))
  const valid = chosen.length > 0 && chosen.length < people.length

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) setChosen([]); onOpenChange(next) }}>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Split {label}</DialogTitle>
          <DialogDescription>
            The candidates you choose move to a new session straight after {label}. Later sessions move back to make room.
          </DialogDescription>
        </DialogHeader>
        {session.grades.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {session.grades.map(group => (
              <Button key={group.grade.id} type="button" variant="outline" size="sm" onClick={() => chooseGrade(group.grade.id)}>
                Choose everyone for <DatabaseGradeBadge grade={group.grade} />
              </Button>
            ))}
          </div>
        )}
        <fieldset className="max-h-80 space-y-1 overflow-y-auto" disabled={busy}>
          <legend className="sr-only">Candidates to move</legend>
          {people.map(({ candidate, grade }) => (
            <label key={candidate.applicationId} className="flex min-h-11 items-center gap-3 rounded-md border border-foreground/10 px-2">
              <input type="checkbox" className="size-4 accent-primary" checked={chosen.includes(candidate.applicationId)}
                onChange={event => toggle(candidate.applicationId, event.target.checked)} />
              <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
              <DatabaseGradeBadge grade={candidate.currentGrade} />
              <span aria-hidden="true" className="text-muted-foreground">→</span>
              <DatabaseGradeBadge grade={grade} />
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {chosen.length === people.length ? 'Leave at least one candidate in this session.'
            : `${chosen.length} of ${people.length} chosen`}
        </p>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />} disabled={busy}>Cancel</DialogClose>
          <Button type="button" disabled={!valid || busy} onClick={() => onSplit(chosen)}>
            {busy ? 'Splitting…' : 'Split session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
