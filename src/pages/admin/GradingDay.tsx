import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { ArrowRightLeft, Ellipsis } from 'lucide-react'
import GradingPanelDialog from '@/components/admin/GradingPanelDialog'
import RetryAlert from '@/components/admin/RetryAlert'
import SplitSessionDialog from '@/components/admin/SplitSessionDialog'
import GradingDayView from '@/components/grading/GradingDayView'
import type { MoveControl, SessionControl } from '@/components/grading/GradingDayView'
import ScheduleNotice from '@/components/grading/ScheduleNotice'
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
  addGradingSession, adminGradingKeys, loadAdminGradingDay, loadBatchSummaries, mergeGradingSessions, moveGradingCandidate,
  publishGradingSchedule, sortGradingSessions, splitGradingSession, unpublishGradingSchedule,
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

// Scheduling is possible once applications close, until an examiner starts
// grading. Private gradings are scheduled by hand instead.
function canSort(day: GradingDay) {
  return day.status !== 'cancelled' && !day.gradingStarted && !day.isPrivate && day.students.length > 0
    && (!day.applicationDeadline || singaporeToday() > day.applicationDeadline)
}

// Publishing is refused while anyone is unplaced or a session is empty.
const publishBlocker = (day: GradingDay) =>
  day.warnings.find(warning => warning.code === 'unscheduled' || warning.code === 'empty_session')?.message ?? null

function GradingDayPage() {
  const { eventId = '' } = useParams()
  const view = useGradingDayLayout()
  const client = useQueryClient()
  const toast = useToast()
  const day = useQuery({ queryKey: adminGradingKeys.day(eventId), queryFn: () => loadAdminGradingDay(eventId), enabled: Boolean(eventId), retry: false })
  const photos = useExaminerPhotos(day.data?.panel.map(member => member.instructorId) ?? [], ids => loadInstructorPhotos(supabase, ids))
  const summaries = useQuery({ queryKey: adminGradingKeys.summaries(eventId), queryFn: () => loadBatchSummaries(eventId), enabled: Boolean(eventId), retry: false })
  const [splitting, setSplitting] = useState<GradingSessionSummary | null>(null)
  // Every schedule change returns the whole updated day.
  const update = (updated: GradingDay) => client.setQueryData(adminGradingKeys.day(eventId), updated)
  const sort = useMutation({
    mutationFn: () => sortGradingSessions(eventId),
    onSuccess: updated => {
      update(updated)
      view.setList('sessions')
      toast.add({ title: `Draft schedule: ${updated.sessions.length === 1 ? '1 session' : `${updated.sessions.length} sessions`}` })
    },
  })
  const move = useMutation({
    mutationFn: ({ applicationId, sessionId }: { applicationId: string; sessionId: string; name: string; from: string | null }) =>
      moveGradingCandidate(applicationId, sessionId),
    onSuccess: (updated, { applicationId, sessionId, name, from }) => {
      update(updated)
      const to = updated.sessions.find(session => session.id === sessionId)
      // Undo only while the session they came from still exists.
      const back = from && updated.sessions.some(session => session.id === from) ? from : null
      toast.add({
        title: `Moved ${name} to ${to ? sessionLabel(to.position) : 'another session'}`,
        actionProps: back ? { children: 'Undo', onClick: () => move.mutate({ applicationId, sessionId: back, name, from: sessionId }) } : undefined,
      })
    },
  })
  const split = useMutation({
    mutationFn: ({ sessionId, applicationIds }: { sessionId: string; applicationIds: string[] }) => splitGradingSession(sessionId, applicationIds),
    onSuccess: updated => { update(updated); setSplitting(null); toast.add({ title: 'Session split' }) },
  })
  const merge = useMutation({
    mutationFn: ({ sourceId, intoId }: { sourceId: string; intoId: string; label: string }) => mergeGradingSessions(sourceId, intoId),
    onSuccess: (updated, { label }) => { update(updated); toast.add({ title: `Merged into ${label}` }) },
  })
  const add = useMutation({
    mutationFn: () => addGradingSession(eventId),
    onSuccess: updated => { update(updated); view.setList('sessions'); toast.add({ title: 'Session added' }) },
  })
  const publish = useMutation({
    mutationFn: (next: boolean) => next ? publishGradingSchedule(eventId) : unpublishGradingSchedule(eventId),
    onSuccess: updated => {
      update(updated)
      toast.add({ title: updated.publishedAt ? 'Schedule published' : 'Schedule returned to draft' })
    },
  })
  const changing = sort.isPending || move.isPending || split.isPending || merge.isPending || add.isPending || publish.isPending
  const error = sort.error ?? move.error ?? split.error ?? merge.error ?? add.error ?? publish.error

  if (day.isPending) return <p className="text-sm text-muted-foreground">Loading grading day…</p>
  if (day.isError) return <RetryAlert message={day.error.message} onRetry={() => void day.refetch()} />
  const data = day.data
  const sessions = data.sessions
  const sortable = canSort(data)

  const editable = data.status !== 'cancelled' && !data.gradingStarted
  const blocker = publishBlocker(data)
  const overflow = data.warnings.find(warning => warning.code === 'overflow')

  // Generate (or regenerate) the draft; private gradings add sessions by hand instead.
  const generate = data.isPrivate ? (
    <Button type="button" variant={sessions.length ? 'outline' : 'default'} disabled={changing} onClick={() => add.mutate()}>
      {add.isPending ? 'Adding…' : 'Add session'}
    </Button>
  ) : !sessions.length ? (
    <Button type="button" disabled={!sortable || changing} onClick={() => sort.mutate()}>
      {sort.isPending ? 'Generating…' : 'Generate draft schedule'}
    </Button>
  ) : (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" variant="outline" disabled={!sortable || changing} />}>
        {sort.isPending ? 'Generating…' : 'Generate again'}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Generate the schedule again?</AlertDialogTitle>
          <AlertDialogDescription>
            Candidates are re-sorted from the scheduling rules and given new candidate numbers. Anything you moved, split or merged by hand is lost{data.publishedAt ? ', and the schedule goes back to draft' : ''}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => sort.mutate()}>Generate again</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  const release = !sessions.length ? null : data.publishedAt ? (
    <Button type="button" variant="outline" disabled={changing} onClick={() => publish.mutate(false)}>
      {publish.isPending ? 'Saving…' : 'Return to draft'}
    </Button>
  ) : (
    <AlertDialog>
      <AlertDialogTrigger render={<Button type="button" disabled={changing || Boolean(blocker)} title={blocker ?? undefined} />}>
        {publish.isPending ? 'Publishing…' : 'Publish schedule'}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish this schedule?</AlertDialogTitle>
          <AlertDialogDescription>
            Every examiner on the panel will see the sessions, and students get the reporting time once its release date arrives.
            {overflow ? ` ${overflow.message}` : ''} Changing anything afterwards returns the schedule to draft.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => publish.mutate(true)}>Publish</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  const headerActions = data.status === 'cancelled' ? undefined : data.gradingStarted ? (
    <p className="text-sm text-muted-foreground">Sessions are locked because grading has started.</p>
  ) : <div className="flex flex-wrap gap-2">{generate}{release}</div>

  // Split off some candidates, or fold this session into another.
  const renderSessionActions: SessionControl | undefined = editable ? session => {
    const others = sessions.filter(option => option.id !== session.id)
    const canSplit = sessionCandidates(session) > 1
    if (!canSplit && !others.length) return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-touch" disabled={changing}
          aria-label={`Change ${sessionLabel(session.position)}`} />}>
          <Ellipsis aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64">
          {canSplit && <DropdownMenuItem onClick={() => setSplitting(session)}>Split session…</DropdownMenuItem>}
          {others.map(option => (
            <DropdownMenuItem key={option.id} className="flex-col items-start gap-1"
              onClick={() => merge.mutate({ sourceId: session.id, intoId: option.id, label: sessionLabel(option.position) })}>
              <span>{sessionCandidates(session) ? 'Merge into' : 'Remove, merging into'} {sessionLabel(option.position)}</span>
              <span className="text-xs text-muted-foreground">{gradingTimeLabel(option.startsAt, option.endsAt)}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  } : undefined

  // A row action rather than an always-on select, so a slip can't move anyone.
  const renderMove: MoveControl | undefined = editable && sessions.length > 1 ? (candidate, session) => {
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
        notice={<ScheduleNotice day={data} viewer="admin" />}
        renderSessionActions={renderSessionActions}
        photos={photos}
        panelAction={<GradingPanelDialog eventId={data.eventId} gradingLabel={gradingDate(data.gradingDate)} panel={data.panel}
          onSaved={() => void day.refetch()} />}
        emptySessions={<GradingNote>{data.isPrivate
          ? 'No sessions yet. This is a private grading, so add sessions by hand.'
          : 'No sessions yet. Generate a draft schedule once applications close.'}</GradingNote>}
        renderMove={renderMove}
        actionFor={session => ({
          href: `/admin/grading/days/${data.eventId}/${encodeURIComponent(session.id)}`,
          // Nothing to call "results" until someone has submitted.
          label: summaries.data?.some(item => item.sessionId === session.id && item.status === 'submitted') ? 'View results' : 'View checklists',
          status: panelProgress(data, session, summaries.data),
        })} />
      {splitting && <SplitSessionDialog key={splitting.id} session={splitting} open busy={split.isPending}
        onOpenChange={open => { if (!open) setSplitting(null) }}
        onSplit={applicationIds => split.mutate({ sessionId: splitting.id, applicationIds })} />}
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
