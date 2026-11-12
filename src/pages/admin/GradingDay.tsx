import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { ArrowRightLeft } from 'lucide-react'
import GradingPanelDialog from '@/components/admin/GradingPanelDialog'
import RetryAlert from '@/components/admin/RetryAlert'
import GradingDayView from '@/components/grading/GradingDayView'
import type { MoveControl } from '@/components/grading/GradingDayView'
import { GradingBackLink, GradingNote } from '@/components/grading/GradingParts'
import DatabaseGradeBadge from '@/components/instructor/DatabaseGradeBadge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ToastProvider, useToast } from '@/components/ui/toast'
import { useGradingDayLayout } from '@/hooks/use-grading-day-layout'
import { useExaminerPhotos } from '@/hooks/use-examiner-photos'
import { loadInstructorPhotos } from '@/lib/instructor/api'
import { supabase } from '@/lib/supabase'
import {
  adminGradingKeys, loadAdminGradingDay, loadBatchSummaries, moveGradingCandidate, sortGradingSessions,
} from '@/lib/admin/grading-results'
import type { BatchSummary } from '@/lib/admin/grading-results'
import { gradingDate, gradingTimeLabel, singaporeToday } from '@/lib/grading/format'
import { sessionCandidates, sessionLabel } from '@/lib/instructor/grading-panels'
import type { GradingDay, GradingSessionSummary } from '@/lib/instructor/grading-panels'

// How many of the panel have submitted this session's checklist.
function panelProgress(day: GradingDay, session: GradingSessionSummary, summaries: BatchSummary[] | undefined) {
  if (!day.panel.length) return 'No examiners assigned'
  if (!summaries) return 'Loading progress…'
  const submitted = summaries.filter(item => item.sessionId === session.id && item.status === 'submitted').length
  return `${submitted} of ${day.panel.length} examiner${day.panel.length === 1 ? '' : 's'} submitted`
}

// Where a candidate in `from` can be moved: every other session. Moving the
// last candidate out removes their session, so the menu says so.
export function moveOptions(sessions: GradingSessionSummary[], from: GradingSessionSummary) {
  const removesFrom = sessionCandidates(from) === 1
  return sessions.filter(option => option.id !== from.id).map(option => ({ option, removesFrom }))
}

// Sorting is possible once applications close, until an examiner starts grading.
function canSort(day: GradingDay) {
  return day.status !== 'cancelled' && !day.gradingStarted && day.students.length > 0
    && (!day.applicationDeadline || singaporeToday() > day.applicationDeadline)
}

function GradingDayPage() {
  const { eventId = '' } = useParams()
  const view = useGradingDayLayout()
  const client = useQueryClient()
  const toast = useToast()
  const day = useQuery({ queryKey: adminGradingKeys.day(eventId), queryFn: () => loadAdminGradingDay(eventId), enabled: Boolean(eventId), retry: false })
  const photos = useExaminerPhotos(day.data?.panel.map(member => member.instructorId) ?? [], ids => loadInstructorPhotos(supabase, ids))
  const summaries = useQuery({ queryKey: adminGradingKeys.summaries(eventId), queryFn: () => loadBatchSummaries(eventId), enabled: Boolean(eventId), retry: false })
  const sort = useMutation({
    mutationFn: () => sortGradingSessions(eventId),
    onSuccess: updated => {
      client.setQueryData(adminGradingKeys.day(eventId), updated)
      view.setList('sessions')
      toast.add({ title: `Sorted into ${updated.sessions.length === 1 ? '1 session' : `${updated.sessions.length} sessions`}` })
    },
  })
  const move = useMutation({
    mutationFn: ({ applicationId, sessionId }: { applicationId: string; sessionId: string; name: string; from: string | null }) =>
      moveGradingCandidate(applicationId, sessionId),
    onSuccess: (updated, { applicationId, sessionId, name, from }) => {
      client.setQueryData(adminGradingKeys.day(eventId), updated)
      const to = updated.sessions.find(session => session.id === sessionId)
      // Undo only while the session they came from still exists.
      const back = from && updated.sessions.some(session => session.id === from) ? from : null
      toast.add({
        title: `Moved ${name} to ${to ? sessionLabel(to.position) : 'another session'}`,
        actionProps: back ? { children: 'Undo', onClick: () => move.mutate({ applicationId, sessionId: back, name, from: sessionId }) } : undefined,
      })
    },
  })
  const changing = sort.isPending || move.isPending
  const error = sort.error ?? move.error

  if (day.isPending) return <p className="text-sm text-muted-foreground">Loading grading day…</p>
  if (day.isError) return <RetryAlert message={day.error.message} onRetry={() => void day.refetch()} />
  const data = day.data
  const sessions = data.sessions
  const sortable = canSort(data)

  // One main action, in the header: sort before sessions exist, sort again after.
  const headerActions = data.status === 'cancelled' ? undefined : data.gradingStarted ? (
    <p className="text-sm text-muted-foreground">Sessions are locked because grading has started.</p>
  ) : !sessions.length ? (
    <Button type="button" disabled={!sortable || changing} onClick={() => sort.mutate()}>
      {sort.isPending ? 'Sorting…' : 'Sort into sessions'}
    </Button>
  ) : (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="outline" disabled={!sortable || changing} />}>
        {sort.isPending ? 'Sorting…' : 'Sort again'}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sort candidates again?</AlertDialogTitle>
          <AlertDialogDescription>
            Everyone goes back into one session per target grade, and candidate numbers are reassigned. Any students you moved by hand are moved back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => sort.mutate()}>Sort again</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // A row action rather than an always-on select, so a slip can't move anyone.
  const renderMove: MoveControl | undefined = !data.gradingStarted && sessions.length > 1 ? (candidate, session) => {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-touch" disabled={changing}
          aria-label={`Move ${candidate.name} to another session`} />}>
          <ArrowRightLeft aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          {moveOptions(sessions, session).map(({ option, removesFrom }) => (
            <DropdownMenuItem key={option.id} className="flex-col items-start gap-1"
              onClick={() => move.mutate({ applicationId: candidate.applicationId, sessionId: option.id, name: candidate.name, from: session.id })}>
              <span className="font-medium">Move to {sessionLabel(option.position)}</span>
              <span className="text-xs text-muted-foreground">{gradingTimeLabel(option.startsAt, option.endsAt)}</span>
              <span className="flex flex-wrap gap-1">
                {option.grades.map(group => <DatabaseGradeBadge key={group.grade.id} grade={group.grade} />)}
              </span>
              {removesFrom && <span className="text-xs text-muted-foreground">{sessionLabel(session.position)} will be removed</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  } : undefined

  return (
    <div className="space-y-4">
      {summaries.isError && <RetryAlert message={summaries.error.message} onRetry={() => void summaries.refetch()} />}
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      <GradingDayView day={data} list={view.list} onListChange={view.setList}
        studentHref={studentId => `/admin/students/${studentId}`}
        headerActions={headerActions}
        photos={photos}
        panelAction={<GradingPanelDialog eventId={data.eventId} gradingLabel={gradingDate(data.gradingDate)} panel={data.panel}
          onSaved={() => void day.refetch()} />}
        emptySessions={<GradingNote>No sessions yet.</GradingNote>}
        renderMove={renderMove}
        actionFor={session => ({
          href: `/admin/grading/days/${data.eventId}/${encodeURIComponent(session.id)}`,
          // Nothing to call "results" until someone has submitted.
          label: summaries.data?.some(item => item.sessionId === session.id && item.status === 'submitted') ? 'View results' : 'View checklists',
          status: panelProgress(data, session, summaries.data),
        })} />
    </div>
  )
}

export default function AdminGradingDay() {
  return (
    <ToastProvider>
      <div className="space-y-4">
        <GradingBackLink to="/admin/grading/opportunities">Back to schedule</GradingBackLink>
        <GradingDayPage />
      </div>
    </ToastProvider>
  )
}
