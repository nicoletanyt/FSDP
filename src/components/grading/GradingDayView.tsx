import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CalendarDays, ChevronRight, Clock3, LayoutGrid, List, MapPin, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import GradeBadge from '@/components/instructor/DatabaseGradeBadge'
import {
  ExaminerPanel, GradingCardFooter, GradingFacts, GradingNote, GradingPageHeader, GradingStatusBadge, gradingActionClass,
} from '@/components/grading/GradingParts'
import { gradingTitle, sessionCandidates, sessionLabel } from '@/lib/instructor/grading-panels'
import type { DayStudent, GradingCandidate, GradingDay, GradingSessionSummary } from '@/lib/instructor/grading-panels'
import { candidateCount, gradingDate, gradingTimeLabel } from '@/lib/grading/format'
import { cn } from 'cn'

export type GradingDayLayout = 'list' | 'grid'
export type GradingDayList = 'students' | 'sessions'

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; text: string; icon?: typeof List }[]
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

const cellClass = 'px-3 py-3'
const headClass = 'px-3 pb-2 font-medium'

// Every applicant, whether or not they have been sorted into a session yet.
function StudentList({ day, studentHref }: { day: GradingDay; studentHref: (studentId: string) => string }) {
  const position = new Map(day.sessions.map(session => [session.id, session.position]))
  const students = [...day.students].sort((a, b) =>
    (a.candidateNumber ?? Infinity) - (b.candidateNumber ?? Infinity) || a.name.localeCompare(b.name))
  if (!students.length) return <GradingNote>No candidates have applied for this grading yet.</GradingNote>
  return (
    <Card className="py-0">
      <CardContent className="overflow-x-auto px-0">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Applicants for {gradingTitle(day)}</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="w-14 px-4 pt-3 pb-2 text-center font-medium">No.</th>
              <th scope="col" className={cn(headClass, 'pt-3')}>Student</th>
              <th scope="col" className={cn(headClass, 'hidden pt-3 md:table-cell')}>Member no.</th>
              <th scope="col" className={cn(headClass, 'pt-3')}>Current grade</th>
              <th scope="col" className={cn(headClass, 'pt-3')}>Target grade</th>
              <th scope="col" className={cn(headClass, 'pt-3 pr-4')}>Session</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student: DayStudent) => (
              <tr key={student.applicationId} className="border-b last:border-0">
                <td className="px-4 py-3 text-center tabular-nums">{student.candidateNumber ?? '—'}</td>
                <th scope="row" className={cn(cellClass, 'text-left font-medium')}>
                  <Link to={studentHref(student.studentId)} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring">{student.name}</Link>
                </th>
                <td className={cn(cellClass, 'hidden tabular-nums text-muted-foreground md:table-cell')}>{student.memberNo ?? '—'}</td>
                <td className={cellClass}><GradeBadge grade={student.currentGrade} /></td>
                <td className={cellClass}><GradeBadge grade={student.targetGrade} /></td>
                <td className={cn(cellClass, 'whitespace-nowrap pr-4 text-muted-foreground')}>
                  {student.sessionId && position.has(student.sessionId) ? sessionLabel(position.get(student.sessionId)!) : 'Not sorted'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

export interface GradeSessionAction {
  href: string
  label: string
  status: string
}

export type MoveControl = (candidate: GradingCandidate, session: GradingSessionSummary) => ReactNode

function SessionCard({ session, action, compact, studentHref, renderMove }: {
  session: GradingSessionSummary
  action: GradeSessionAction
  compact: boolean
  studentHref: (studentId: string) => string
  renderMove?: MoveControl
}) {
  const label = sessionLabel(session.position)
  const mixed = session.grades.length > 1
  const rows = session.grades.flatMap(group => group.candidates.map(candidate => ({ candidate, grade: group.grade })))
    .sort((a, b) => (a.candidate.candidateNumber ?? Infinity) - (b.candidate.candidateNumber ?? Infinity))
  return (
    <Card className="h-full">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <CardTitle className="text-lg font-semibold">{label}</CardTitle>
          <ul className="flex flex-wrap gap-1.5" aria-label={`Grades in ${label}`}>
            {session.grades.map(group => <li key={group.grade.id}><GradeBadge grade={group.grade} /></li>)}
          </ul>
        </div>
        <GradingFacts items={[
          { key: 'time', icon: Clock3, label: gradingTimeLabel(session.startsAt, session.endsAt) },
          { key: 'candidates', icon: Users, label: candidateCount(sessionCandidates(session)) },
        ]} />
      </CardHeader>
      <CardContent className="flex-1 overflow-x-auto px-0">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Candidates in {label}</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="w-14 px-4 pb-2 text-center font-medium">No.</th>
              <th scope="col" className={headClass}>Student</th>
              {!compact && <th scope="col" className={cn(headClass, 'hidden sm:table-cell')}>Member no.</th>}
              {mixed && <th scope="col" className={headClass}>Target grade</th>}
              <th scope="col" className={cn(headClass, !renderMove && 'pr-4')}>Current grade</th>
              {renderMove && <th scope="col" className={cn(headClass, 'pr-4')}>Move to</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ candidate, grade }) => (
              <tr key={candidate.applicationId} className="border-b last:border-0">
                <td className="px-4 py-3 text-center tabular-nums">{candidate.candidateNumber ?? '—'}</td>
                <th scope="row" className={cn(cellClass, 'text-left font-medium')}>
                  <Link to={studentHref(candidate.studentId)} className="hover:underline focus-visible:outline-2 focus-visible:outline-ring">{candidate.name}</Link>
                </th>
                {!compact && <td className={cn(cellClass, 'hidden tabular-nums text-muted-foreground sm:table-cell')}>{candidate.memberNo ?? '—'}</td>}
                {mixed && <td className={cellClass}><GradeBadge grade={grade} /></td>}
                <td className={cn(cellClass, !renderMove && 'pr-4')}><GradeBadge grade={candidate.currentGrade} /></td>
                {renderMove && <td className={cn(cellClass, 'pr-4')}>{renderMove(candidate, session)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
      <GradingCardFooter status={action.status}>
        <Link to={action.href} className={gradingActionClass}>
          {action.label}
          <span className="sr-only">: {label}</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </GradingCardFooter>
    </Card>
  )
}

// A grading day: its details and panel, then either every applicant (student
// list) or the sorted sessions (session list).
export default function GradingDayView({
  day, list, layout, onListChange, onLayoutChange, viewerIsChief = false, actionFor, studentHref,
  emptySessions, sessionActions, renderMove,
}: {
  day: GradingDay
  list: GradingDayList | null
  layout: GradingDayLayout
  onListChange: (list: GradingDayList) => void
  onLayoutChange: (layout: GradingDayLayout) => void
  viewerIsChief?: boolean
  actionFor: (session: GradingSessionSummary) => GradeSessionAction
  studentHref: (studentId: string) => string
  // Shown in place of the session list before sorting (a note, plus the sort button for admins).
  emptySessions: ReactNode
  // Extra controls beside the session list (e.g. "Sort again").
  sessionActions?: ReactNode
  renderMove?: MoveControl
}) {
  // Until candidates are sorted there are no sessions to show.
  const shown: GradingDayList = list ?? (day.sessions.length ? 'sessions' : 'students')
  const grades = new Set(day.students.map(student => student.targetGrade.id)).size
  return (
    <div className="space-y-8">
      <GradingPageHeader title={gradingTitle(day)} badges={<GradingStatusBadge status={day.status} />} facts={[
        { key: 'date', icon: CalendarDays, label: gradingDate(day.gradingDate, 'long') },
        { key: 'time', icon: Clock3, label: gradingTimeLabel(day.startsAt, day.endsAt, day.reportingTime) },
        { key: 'centre', icon: MapPin, label: day.centre.address ? `${day.centre.name} · ${day.centre.address}` : day.centre.name },
        { key: 'candidates', icon: Users, label: `${candidateCount(day.students.length)} across ${grades === 1 ? '1 grade' : `${grades} grades`}` },
      ]}>
        <ExaminerPanel panel={day.panel} viewerIsChief={viewerIsChief} label={`Examiners for ${gradingTitle(day)}`} />
      </GradingPageHeader>
      <section className="space-y-4" aria-label={shown === 'students' ? 'Student list' : 'Session list'}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented label="Grading day list" value={shown} onChange={onListChange} options={[
            { value: 'students', text: 'Student list' },
            { value: 'sessions', text: 'Session list' },
          ]} />
          {shown === 'sessions' && day.sessions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {sessionActions}
              {day.sessions.length > 1 && <Segmented label="Grading session layout" value={layout} onChange={onLayoutChange} options={[
                { value: 'list', text: 'List', icon: List },
                { value: 'grid', text: 'Grid', icon: LayoutGrid },
              ]} />}
            </div>
          )}
        </div>
        {shown === 'students' ? <StudentList day={day} studentHref={studentHref} />
          : day.sessions.length ? (
            <div className={cn('grid gap-4', layout === 'grid' && 'md:grid-cols-2 xl:grid-cols-3')}>
              {day.sessions.map(session => (
                <SessionCard key={session.id} session={session} action={actionFor(session)} compact={layout === 'grid'}
                  studentHref={studentHref} renderMove={renderMove} />
              ))}
            </div>
          ) : emptySessions}
      </section>
    </div>
  )
}
