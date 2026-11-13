import { useQuery } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router'
import { CalendarDays, Check, Clock3, MapPin, Users, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DatabaseGradeBadge from '@/components/instructor/DatabaseGradeBadge'
import GradingChecklistTable from '@/components/grading/GradingChecklistTable'
import { GradingBackLink, GradingNote, GradingPageHeader, GradingStatusBadge } from '@/components/grading/GradingParts'
import RetryAlert from '@/components/admin/RetryAlert'
import { adminGradingKeys, loadAdminGradingDay, loadSessionResults, resultKey } from '@/lib/admin/grading-results'
import type { ExaminerResults } from '@/lib/admin/grading-results'
import { candidateCount, gradingDate, gradingStamp, gradingTimeLabel } from '@/lib/grading/format'
import { gradingTitle, sessionCandidates, sessionLabel } from '@/lib/instructor/grading-panels'
import type { GradingSessionSummary } from '@/lib/instructor/grading-panels'

interface Examiner { instructorId: string; name: string; isChief: boolean; batch: ExaminerResults | null }

const progressOf = (batch: ExaminerResults | null) =>
  !batch ? 'Not started' : batch.status === 'submitted' ? 'Submitted' : 'Draft in progress'

// One examiner at a time, so the checklist stays as readable as the one they filled in.
function ExaminerPicker({ examiners, selected, onSelect }: { examiners: Examiner[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <div role="group" aria-label="Examiner" className="flex flex-wrap gap-2">
      {examiners.map(examiner => (
        <Button key={examiner.instructorId} type="button" variant={examiner.instructorId === selected ? 'secondary' : 'outline'}
          aria-pressed={examiner.instructorId === selected} onClick={() => onSelect(examiner.instructorId)}
          className="h-auto min-h-11 flex-col items-start gap-0 px-3 py-1.5 text-left">
          <span className="font-medium">{examiner.name}{examiner.isChief && <span className="font-normal text-muted-foreground"> · Chief</span>}</span>
          <span className="text-xs font-normal text-muted-foreground">{progressOf(examiner.batch)}</span>
        </Button>
      ))}
    </div>
  )
}

// One read-only table per grade in the session; grades are only named above
// their tables when the session mixes grades (the header names a lone grade).
function ExaminerChecklist({ examiner, session }: { examiner: Examiner; session: GradingSessionSummary }) {
  const { batch } = examiner
  if (!batch) return <GradingNote>{examiner.name} hasn’t started this checklist yet.</GradingNote>
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
            cell={(student, item) => batch.passed.has(resultKey(student.student_id, item.syllabus_item_id))
              ? <span className="inline-flex min-h-11 items-center text-success"><Check className="size-5" aria-hidden="true" /><span className="sr-only">Passed</span></span>
              : <span className="inline-flex min-h-11 items-center text-muted-foreground"><X className="size-5" aria-hidden="true" /><span className="sr-only">Not passed</span></span>}
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

export default function AdminGradingResults() {
  const { eventId = '', sessionId = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const day = useQuery({ queryKey: adminGradingKeys.day(eventId), queryFn: () => loadAdminGradingDay(eventId), enabled: Boolean(eventId), retry: false })
  const results = useQuery({ queryKey: adminGradingKeys.results(eventId, sessionId), queryFn: () => loadSessionResults(eventId, sessionId),
    enabled: Boolean(eventId && sessionId), retry: false })
  const back = <GradingBackLink to={`/admin/grading/days/${eventId}`}>Back to grading day</GradingBackLink>

  if (day.isPending) return <div className="space-y-4">{back}<p className="text-sm text-muted-foreground">Loading results…</p></div>
  if (day.isError) return <div className="space-y-4">{back}<RetryAlert message={day.error.message} onRetry={() => void day.refetch()} /></div>
  const session = day.data.sessions.find(item => item.id === sessionId)
  if (!session) return <div className="space-y-4">{back}<GradingNote>This session isn’t part of this grading. It may have been re-sorted.</GradingNote></div>

  // The panel first, then anyone who graded but has since left it.
  const batches = results.data ?? []
  const examiners: Examiner[] = [
    ...day.data.panel.map(member => ({ ...member, batch: batches.find(batch => batch.instructorId === member.instructorId) ?? null })),
    ...batches.filter(batch => !day.data.panel.some(member => member.instructorId === batch.instructorId))
      .map(batch => ({ instructorId: batch.instructorId, name: batch.instructorName, isChief: false, batch })),
  ]
  const requested = search.get('examiner')
  const selected = examiners.find(item => item.instructorId === requested)
    ?? examiners.find(item => item.batch?.status === 'submitted') ?? examiners[0]
  const select = (id: string) => setSearch(current => {
    const params = new URLSearchParams(current)
    params.set('examiner', id)
    return params
  }, { replace: true })

  return (
    <div className="space-y-4">
      {back}
      <div className="space-y-8">
        <GradingPageHeader title={gradingTitle(day.data)}
          badges={<>
            <Badge variant="secondary">{sessionLabel(session.position)}</Badge>
            {session.grades.map(group => <DatabaseGradeBadge key={group.grade.id} grade={group.grade} showBeltLabel />)}
            <GradingStatusBadge status={day.data.status} />
          </>}
          facts={[
            { key: 'date', icon: CalendarDays, label: gradingDate(day.data.gradingDate, 'long') },
            { key: 'time', icon: Clock3, label: gradingTimeLabel(session.startsAt, session.endsAt) },
            { key: 'centre', icon: MapPin, label: day.data.centre.name },
            { key: 'candidates', icon: Users, label: candidateCount(sessionCandidates(session)) },
          ]} />
        <section className="space-y-4" aria-labelledby="examiner-results">
          <h2 id="examiner-results" className="text-xl font-semibold">Examiner results</h2>
          {results.isPending ? (
            <p className="text-sm text-muted-foreground">Loading results…</p>
          ) : results.isError ? (
            <RetryAlert message={results.error.message} onRetry={() => void results.refetch()} />
          ) : !selected ? (
            <GradingNote>No examiners are assigned to this grading, so there are no results yet.</GradingNote>
          ) : (
            <>
              <ExaminerPicker examiners={examiners} selected={selected.instructorId} onSelect={select} />
              <ExaminerChecklist examiner={selected} session={session} />
            </>
          )}
        </section>
      </div>
    </div>
  )
}
