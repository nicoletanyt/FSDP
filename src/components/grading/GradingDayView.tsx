import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CalendarDays, ChevronRight, Clock3, MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import GradeBadge from '@/components/instructor/DatabaseGradeBadge'
import {
  ExaminerPanel, GradingCardFooter, GradingFacts, GradingNote, GradingPageHeader, GradingStatusPill, Segmented, gradingActionClass,
} from '@/components/grading/GradingParts'
import { gradingTitle, sessionCandidates, sessionLabel } from '@/lib/instructor/grading-panels'
import type { DayStudent, GradingCandidate, GradingDay, GradingSessionSummary } from '@/lib/instructor/grading-panels'
import { candidateCount, gradingDate, gradingTimeLabel } from '@/lib/grading/format'
import { cn } from 'cn'

export type GradingDayList = 'students' | 'sessions'

const cellClass = 'px-3 py-3'
const headClass = 'px-3 pb-2 font-medium'

// Columns of placeholders are noise: only show numbers and member numbers when someone has one.
const anyNumber = (people: GradingCandidate[]) => people.some(person => person.candidateNumber !== null)
const anyMemberNo = (people: GradingCandidate[]) => people.some(person => person.memberNo)

// Every applicant, grouped by the grade they are attempting.
function StudentList({ day, studentHref }: { day: GradingDay; studentHref: (studentId: string) => string }) {
  const sorted = day.sessions.length > 0
  const numbered = sorted && anyNumber(day.students)
  const members = anyMemberNo(day.students)
  const position = new Map(day.sessions.map(session => [session.id, session.position]))
  const byGrade = new Map<string, DayStudent[]>()
  for (const student of day.students) byGrade.set(student.targetGrade.id, [...(byGrade.get(student.targetGrade.id) ?? []), student])
  const groups = [...byGrade.values()]
    .map(students => ({ grade: students[0].targetGrade, students: [...students].sort((a, b) =>
      (a.candidateNumber ?? Infinity) - (b.candidateNumber ?? Infinity) || a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.grade.sort_order - b.grade.sort_order)
  if (!groups.length) return <GradingNote>No candidates have applied for this grading yet.</GradingNote>
  const columns = 2 + (numbered ? 1 : 0) + (members ? 1 : 0) + (sorted ? 1 : 0)
  return (
    <Card className="py-0">
      <CardContent className="overflow-x-auto px-0">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Applicants for {gradingTitle(day)}, by target grade</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {numbered && <th scope="col" className="w-14 px-4 pt-3 pb-2 text-center font-medium">No.</th>}
              <th scope="col" className={cn(headClass, 'pt-3', !numbered && 'pl-4')}>Student</th>
              {members && <th scope="col" className={cn(headClass, 'hidden pt-3 md:table-cell')}>Member no.</th>}
              <th scope="col" className={cn(headClass, 'pt-3', !sorted && 'pr-4')}>Current grade</th>
              {sorted && <th scope="col" className={cn(headClass, 'pt-3 pr-4')}>Session</th>}
            </tr>
          </thead>
          {groups.map(group => (
            <tbody key={group.grade.id}>
              <tr className="border-b" data-grade-group>
                <th scope="rowgroup" colSpan={columns} className="px-4 pt-4 pb-2 text-left font-normal">
                  <span className="flex flex-wrap items-center gap-2">
                    <GradeBadge grade={group.grade} showBeltLabel />
                    <span className="text-xs text-muted-foreground">{candidateCount(group.students.length)}</span>
                  </span>
                </th>
              </tr>
              {group.students.map(student => (
                <tr key={student.applicationId} className="border-b last:border-0">
                  {numbered && <td className="px-4 py-3 text-center tabular-nums">{student.candidateNumber ?? ''}</td>}
                  <th scope="row" className={cn(cellClass, 'text-left font-medium', !numbered && 'pl-4')}>
                    <Link to={studentHref(student.studentId)} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring">{student.name}</Link>
                  </th>
                  {members && <td className={cn(cellClass, 'hidden tabular-nums text-muted-foreground md:table-cell')}>{student.memberNo ?? ''}</td>}
                  <td className={cn(cellClass, !sorted && 'pr-4')}><GradeBadge grade={student.currentGrade} /></td>
                  {sorted && <td className={cn(cellClass, 'whitespace-nowrap pr-4 text-muted-foreground')}>
                    {student.sessionId && position.has(student.sessionId) ? sessionLabel(position.get(student.sessionId)!) : 'Not sorted'}
                  </td>}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </CardContent>
    </Card>
  )
}

export interface GradeSessionAction {
  href: string
  label: string
  // Shown beside the action only when it adds something (a saved draft, submissions so far).
  status?: string
}

export type MoveControl = (candidate: GradingCandidate, session: GradingSessionSummary) => ReactNode
export type SessionControl = (session: GradingSessionSummary) => ReactNode

function SessionCard({ session, action, studentHref, renderMove, renderSessionActions }: {
  session: GradingSessionSummary
  // Null when the session can't be opened yet (a draft, for the chief examiner).
  action: GradeSessionAction | null
  studentHref: (studentId: string) => string
  renderMove?: MoveControl
  renderSessionActions?: SessionControl
}) {
  const label = sessionLabel(session.position)
  const mixed = session.grades.length > 1
  const rows = session.grades.flatMap(group => group.candidates.map(candidate => ({ candidate, grade: group.grade })))
    .sort((a, b) => (a.candidate.candidateNumber ?? Infinity) - (b.candidate.candidateNumber ?? Infinity))
  const people = rows.map(row => row.candidate)
  const numbered = anyNumber(people)
  const members = anyMemberNo(people)
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <CardTitle>{label}</CardTitle>
            <ul className="flex flex-wrap gap-1.5" aria-label={`Grades in ${label}`}>
              {session.grades.map(group => <li key={group.grade.id}><GradeBadge grade={group.grade} /></li>)}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GradingFacts items={[{ key: 'time', icon: Clock3,
              label: `${gradingTimeLabel(session.startsAt, session.endsAt)}, ${candidateCount(sessionCandidates(session))}` }]} />
            {renderSessionActions?.(session)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Candidates in {label}</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              {numbered && <th scope="col" className="w-14 px-4 pb-2 text-center font-medium">No.</th>}
              <th scope="col" className={cn(headClass, !numbered && 'pl-4')}>Student</th>
              {members && <th scope="col" className={cn(headClass, 'hidden sm:table-cell')}>Member no.</th>}
              {mixed && <th scope="col" className={headClass}>Target grade</th>}
              <th scope="col" className={cn(headClass, !renderMove && 'pr-4')}>Current grade</th>
              {renderMove && <th scope="col" className="w-14 pr-2 pb-2"><span className="sr-only">Move</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ candidate, grade }) => (
              <tr key={candidate.applicationId} className="border-b last:border-0">
                {numbered && <td className="px-4 py-3 text-center tabular-nums">{candidate.candidateNumber ?? ''}</td>}
                <th scope="row" className={cn(cellClass, 'text-left font-medium', !numbered && 'pl-4')}>
                  <Link to={studentHref(candidate.studentId)} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring">{candidate.name}</Link>
                </th>
                {members && <td className={cn(cellClass, 'hidden tabular-nums text-muted-foreground sm:table-cell')}>{candidate.memberNo ?? ''}</td>}
                {mixed && <td className={cellClass}><GradeBadge grade={grade} /></td>}
                <td className={cn(cellClass, !renderMove && 'pr-4')}><GradeBadge grade={candidate.currentGrade} /></td>
                {renderMove && <td className="w-14 py-1 pr-2 text-right">{renderMove(candidate, session)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
      {action && <GradingCardFooter status={action.status}>
        <Link to={action.href} className={gradingActionClass}>
          {action.label}
          <span className="sr-only">: {label}</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </GradingCardFooter>}
    </Card>
  )
}

// A grading day: its details and examiner panel, then either every applicant
// (student list) or the sorted sessions (session list).
export default function GradingDayView({
  day, list, onListChange, viewerIsChief = false, actionFor, studentHref,
  emptySessions, renderMove, renderSessionActions, headerActions, panelAction, photos, notice,
}: {
  day: GradingDay
  list: GradingDayList | null
  onListChange: (list: GradingDayList) => void
  viewerIsChief?: boolean
  actionFor: (session: GradingSessionSummary) => GradeSessionAction | null
  studentHref: (studentId: string) => string
  // Shown in place of the session list before sorting.
  emptySessions: ReactNode
  renderMove?: MoveControl
  // Per-session controls in the card header (admins: split and merge).
  renderSessionActions?: SessionControl
  // Shown above the lists (draft status and schedule warnings).
  notice?: ReactNode
  // The page's main action (admins: sort into sessions), beside the title.
  headerActions?: ReactNode
  // In the examiner panel card (admins: edit the panel).
  panelAction?: ReactNode
  // Examiner photo links by instructor ID.
  photos?: Record<string, string>
}) {
  // Until candidates are sorted there are no sessions to show.
  const shown: GradingDayList = list ?? (day.sessions.length ? 'sessions' : 'students')
  return (
    <div className="space-y-6">
      <GradingPageHeader title={gradingTitle(day)} actions={headerActions}
        badges={<GradingStatusPill status={day.status} closesOn={day.applicationDeadline} gradingDate={day.gradingDate} />}
        facts={[
          { key: 'date', icon: CalendarDays, label: gradingDate(day.gradingDate, 'long') },
          { key: 'time', icon: Clock3, label: gradingTimeLabel(day.startsAt, day.endsAt, day.reportingTime) },
          { key: 'centre', icon: MapPin, label: day.centre.address ? `${day.centre.name}, ${day.centre.address}` : day.centre.name },
        ]} />
      <Card className="px-5 py-4" data-examiner-panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <ExaminerPanel panel={day.panel} viewerIsChief={viewerIsChief} label={`Examiners for ${gradingTitle(day)}`} photos={photos} />
          {panelAction}
        </div>
      </Card>
      {notice}
      <section className="space-y-4" aria-label={shown === 'students' ? 'Student list' : 'Session list'}>
        <Segmented label="Grading day list" value={shown} onChange={onListChange} options={[
          { value: 'students', text: 'Student list' },
          { value: 'sessions', text: 'Session list' },
        ]} />
        {shown === 'students' ? <StudentList day={day} studentHref={studentHref} />
          : day.sessions.length ? (
            <div className="grid gap-4">
              {day.sessions.map(session => (
                <SessionCard key={session.id} session={session} action={actionFor(session)}
                  studentHref={studentHref} renderMove={renderMove} renderSessionActions={renderSessionActions} />
              ))}
            </div>
          ) : emptySessions}
      </section>
    </div>
  )
}
