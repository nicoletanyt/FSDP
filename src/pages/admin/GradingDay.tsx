import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router'
import RetryAlert from '@/components/admin/RetryAlert'
import { NativeSelect } from '@/components/admin/form-controls'
import GradingDayView from '@/components/grading/GradingDayView'
import { GradingBackLink } from '@/components/grading/GradingParts'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useGradingDayLayout } from '@/hooks/use-grading-day-layout'
import {
  adminGradingKeys, loadAdminGradingDay, loadBatchSummaries, moveGradingCandidate, sortGradingSessions,
} from '@/lib/admin/grading-results'
import type { BatchSummary } from '@/lib/admin/grading-results'
import { gradingDate, singaporeToday } from '@/lib/grading/format'
import { sessionLabel } from '@/lib/instructor/grading-panels'
import type { GradingDay, GradingSessionSummary } from '@/lib/instructor/grading-panels'

// How many of the panel have submitted this session's checklist.
function panelProgress(day: GradingDay, session: GradingSessionSummary, summaries: BatchSummary[] | undefined) {
  if (!day.panel.length) return 'No examiners assigned'
  if (!summaries) return 'Loading progress…'
  const submitted = summaries.filter(item => item.sessionId === session.id && item.status === 'submitted').length
  return `${submitted} of ${day.panel.length} examiner${day.panel.length === 1 ? '' : 's'} submitted`
}

// Why sorting isn't possible right now, or null when it is.
function sortBlocked(day: GradingDay) {
  if (day.status === 'cancelled') return 'This grading is cancelled.'
  if (day.gradingStarted) return 'An examiner has started grading, so sessions can no longer change.'
  if (day.applicationDeadline && singaporeToday() <= day.applicationDeadline) {
    return `Applications close on ${gradingDate(day.applicationDeadline)}. Sort candidates into sessions after that.`
  }
  if (!day.students.length) return 'No one has applied for this grading yet.'
  return null
}

export default function AdminGradingDay() {
  const { eventId = '' } = useParams()
  const view = useGradingDayLayout()
  const client = useQueryClient()
  const day = useQuery({ queryKey: adminGradingKeys.day(eventId), queryFn: () => loadAdminGradingDay(eventId), enabled: Boolean(eventId), retry: false })
  const summaries = useQuery({ queryKey: adminGradingKeys.summaries(eventId), queryFn: () => loadBatchSummaries(eventId), enabled: Boolean(eventId), retry: false })
  const sort = useMutation({
    mutationFn: () => sortGradingSessions(eventId),
    onSuccess: updated => { client.setQueryData(adminGradingKeys.day(eventId), updated); view.setList('sessions') },
  })
  const move = useMutation({
    mutationFn: ({ applicationId, sessionId }: { applicationId: string; sessionId: string }) => moveGradingCandidate(applicationId, sessionId),
    onSuccess: updated => client.setQueryData(adminGradingKeys.day(eventId), updated),
  })
  const changing = sort.isPending || move.isPending
  const error = sort.error ?? move.error

  return (
    <div className="space-y-4">
      <GradingBackLink to="/admin/grading/opportunities">Back to grading schedule</GradingBackLink>
      {day.isPending ? (
        <p className="text-sm text-muted-foreground">Loading grading day…</p>
      ) : day.isError ? (
        <RetryAlert message={day.error.message} onRetry={() => void day.refetch()} />
      ) : (() => {
        const blocked = sortBlocked(day.data)
        const sessions = day.data.sessions
        return (
          <div className="space-y-4">
            {summaries.isError && <RetryAlert message={summaries.error.message} onRetry={() => void summaries.refetch()} />}
            {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
            <GradingDayView day={day.data} list={view.list} layout={view.layout}
              onListChange={view.setList} onLayoutChange={view.setLayout}
              studentHref={studentId => `/admin/students/${studentId}`}
              emptySessions={
                <div className="flex flex-col items-start gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-muted-foreground">
                    {blocked ?? 'Sort applicants into one session per target grade. You can then move students between sessions.'}
                  </p>
                  <Button type="button" disabled={Boolean(blocked) || changing} onClick={() => sort.mutate()}>
                    {sort.isPending ? 'Sorting…' : 'Sort into sessions'}
                  </Button>
                </div>
              }
              // Always offered, so admins can see why re-sorting isn't possible yet.
              sessionActions={blocked ? (
                <>
                  <p className="max-w-xs text-sm text-muted-foreground">{blocked}</p>
                  <Button type="button" variant="outline" size="sm" className="h-10" disabled>Sort again</Button>
                </>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger render={<Button type="button" variant="outline" size="sm" className="h-10" disabled={changing} />}>
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
              )}
              // Moving needs somewhere to go, and stops once grading has started.
              renderMove={!day.data.gradingStarted && sessions.length > 1 ? (candidate, session) => (
                <NativeSelect aria-label={`Move ${candidate.name} to another session`} className="h-9 min-w-32"
                  value={session.id} disabled={changing}
                  onChange={event => move.mutate({ applicationId: candidate.applicationId, sessionId: event.target.value })}>
                  {sessions.map(option => <option key={option.id} value={option.id}>{sessionLabel(option.position)}</option>)}
                </NativeSelect>
              ) : undefined}
              actionFor={session => ({
                href: `/admin/grading/days/${day.data.eventId}/${encodeURIComponent(session.id)}`,
                label: 'View results',
                status: panelProgress(day.data, session, summaries.data),
              })} />
          </div>
        )
      })()}
    </div>
  )
}
