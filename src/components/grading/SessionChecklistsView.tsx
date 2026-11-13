import { CalendarDays, Clock3, MapPin, Users } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DatabaseGradeBadge from '@/components/instructor/DatabaseGradeBadge'
import GradingChecklistTable from '@/components/grading/GradingChecklistTable'
import { GradingNote, GradingPageHeader, GradingStatusBadge } from '@/components/grading/GradingParts'
import RetryAlert from '@/components/admin/RetryAlert'
import { resultKey } from '@/lib/grading/checklist-results'
import type { ExaminerResults } from '@/lib/grading/checklist-results'
import { candidateCount, gradingDate, gradingStamp, gradingTimeLabel } from '@/lib/grading/format'
import { gradingTitle, sessionCandidates, sessionLabel } from '@/lib/instructor/grading-panels'
import type { GradingDay, GradingSessionSummary } from '@/lib/instructor/grading-panels'

export interface Examiner { instructorId: string; name: string; isChief: boolean; batch: ExaminerResults | null }

// Who the viewer may see: every examiner's checklists, drafts included
// (administrators), or only submitted ones (the chief examiner, whose row
// security hides other examiners' drafts).
export type ChecklistScope = 'all' | 'submitted'

export interface ChecklistResults {
  isPending: boolean
  isError: boolean
  error: Error | null
  data: ExaminerResults[] | undefined
  refetch: () => unknown
}

// With 'submitted', a missing batch may be a draft the viewer can't read, so don't claim "Not started".
const progressOf = (batch: ExaminerResults | null, scope: ChecklistScope) =>
  !batch ? (scope === 'submitted' ? 'Not submitted yet' : 'Not started')
    : batch.status === 'submitted' ? 'Submitted' : 'Draft in progress'

// The panel first, then anyone who graded but has since left it.
export function examinersOf(day: GradingDay, batches: ExaminerResults[]): Examiner[] {
  return [
    ...day.panel.map(member => ({ ...member, batch: batches.find(batch => batch.instructorId === member.instructorId) ?? null })),
    ...batches.filter(batch => !day.panel.some(member => member.instructorId === batch.instructorId))
      .map(batch => ({ instructorId: batch.instructorId, name: batch.instructorName, isChief: false, batch })),
  ]
}

// One examiner at a time, so the checklist stays as readable as the one they filled in.
// `progress` overrides an examiner's status line (e.g. the viewer's own, live checklist).
export function ExaminerPicker({ examiners, selected, onSelect, scope, viewerId, progress }: {
  examiners: Examiner[]; selected: string; onSelect: (id: string) => void; scope: ChecklistScope
  viewerId?: string; progress?: (examiner: Examiner) => string | undefined
}) {
  return (
    <div role="group" aria-label="Examiner" className="flex flex-wrap gap-2">
      {examiners.map(examiner => (
        <Button key={examiner.instructorId} type="button" variant={examiner.instructorId === selected ? 'secondary' : 'outline'}
          aria-pressed={examiner.instructorId === selected} onClick={() => onSelect(examiner.instructorId)}
          className="h-auto min-h-11 flex-col items-start gap-0 px-3 py-1.5 text-left">
          <span className="font-medium">
            {examiner.name}
            {examiner.isChief && <span className="font-normal text-muted-foreground"> · Chief</span>}
            {examiner.instructorId === viewerId && <span className="font-normal text-muted-foreground"> (you)</span>}
          </span>
          <span className="text-xs font-normal text-muted-foreground">{progress?.(examiner) ?? progressOf(examiner.batch, scope)}</span>
        </Button>
      ))}
    </div>
  )
}

// One read-only table per grade in the session; grades are only named above
// their tables when the session mixes grades (the header names a lone grade).
export function ExaminerChecklist({ examiner, session, scope }: { examiner: Examiner; session: GradingSessionSummary; scope: ChecklistScope }) {
  const { batch } = examiner
  if (!batch) {
    return <GradingNote>{scope === 'submitted'
      ? `${examiner.name} hasn’t submitted this checklist yet.`
      : `${examiner.name} hasn’t started this checklist yet.`}</GradingNote>
  }
  if (batch.status !== 'submitted') {
    return <GradingNote>{examiner.name} has a draft in progress. Their results appear here once they submit.</GradingNote>
  }
  const mixed = session.grades.length > 1
  const groups = session.grades.map(group => ({
    grade: group.grade,
    students: batch.students.filter(student => student.target_grade_id === group.grade.id),
    items: batch.items.filter(item => item.grade_id === group.grade.id),
  })).filter(group => group.students.length)
  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div key={group.grade.id} className="space-y-3">
          {mixed && (
            <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
              {group.grade.label}
              <span className="text-sm font-normal text-muted-foreground">{candidateCount(group.students.length)}</span>
            </h3>
          )}
          <GradingChecklistTable label={mixed ? `Grading checklist: ${group.grade.label}` : undefined} students={group.students} items={group.items}
            cell={(student, item) => {
              const mark = batch.marks.get(resultKey(student.student_id, item.syllabus_item_id))
              return mark
                ? <span className="inline-flex min-h-11 items-center font-semibold" data-mark={mark}>{mark}</span>
                : <span className="inline-flex min-h-11 items-center text-muted-foreground"><span aria-hidden="true">–</span><span className="sr-only">Not marked</span></span>
            }}
            comment={student => student.notes
              ? <p className="min-w-40 whitespace-pre-wrap sm:min-w-52">{student.notes}</p>
              : <span className="text-muted-foreground">No comment</span>} />
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        Submitted <time dateTime={batch.submittedAt!}>{gradingStamp(batch.submittedAt!)}</time>
      </p>
    </div>
  )
}

// The administrator's results page: every examiner's checklist for one session.
export default function SessionChecklistsView({ day, session, results, scope }: {
  day: GradingDay
  session: GradingSessionSummary
  results: ChecklistResults
  scope: ChecklistScope
}) {
  const [search, setSearch] = useSearchParams()
  const examiners = examinersOf(day, results.data ?? [])
  const requested = search.get('examiner')
  const selected = examiners.find(item => item.instructorId === requested)
    ?? examiners.find(item => item.batch?.status === 'submitted') ?? examiners[0]
  const select = (id: string) => setSearch(current => {
    const params = new URLSearchParams(current)
    params.set('examiner', id)
    return params
  }, { replace: true })

  return (
    <div className="space-y-8">
      <GradingPageHeader title={gradingTitle(day)}
        badges={<>
          <Badge variant="secondary">{sessionLabel(session.position)}</Badge>
          {session.grades.map(group => <DatabaseGradeBadge key={group.grade.id} grade={group.grade} showBeltLabel />)}
          <GradingStatusBadge status={day.status} />
        </>}
        facts={[
          { key: 'date', icon: CalendarDays, label: gradingDate(day.gradingDate, 'long') },
          { key: 'time', icon: Clock3, label: gradingTimeLabel(session.startsAt, session.endsAt) },
          { key: 'centre', icon: MapPin, label: day.centre.name },
          { key: 'candidates', icon: Users, label: candidateCount(sessionCandidates(session)) },
        ]} />
      <section className="space-y-4" aria-labelledby="examiner-results">
        <h2 id="examiner-results" className="text-xl font-semibold">Examiner results</h2>
        {results.isPending ? (
          <p className="text-sm text-muted-foreground">Loading results…</p>
        ) : results.isError ? (
          <RetryAlert message={results.error?.message ?? 'Unable to load results. Try again.'} onRetry={() => void results.refetch()} />
        ) : !selected ? (
          <GradingNote>No examiners are assigned to this grading, so there are no results yet.</GradingNote>
        ) : (
          <>
            <ExaminerPicker examiners={examiners} selected={selected.instructorId} onSelect={select} scope={scope} />
            <ExaminerChecklist examiner={selected} session={session} scope={scope} />
          </>
        )}
      </section>
    </div>
  )
}
