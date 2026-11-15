import { useQuery } from '@tanstack/react-query'
import { TableSkeleton } from '@/components/shared/skeletons'
import { useParams } from 'react-router'
import SessionChecklistsView from '@/components/grading/SessionChecklistsView'
import { GradingBackLink, GradingNote } from '@/components/grading/GradingParts'
import RetryAlert from '@/components/shared/layout/RetryAlert'
import { adminGradingKeys, loadAdminGradingDay, loadSessionResults } from '@/lib/admin/grading-results'

export default function AdminGradingResults() {
  const { eventId = '', sessionId = '' } = useParams()
  const day = useQuery({ queryKey: adminGradingKeys.day(eventId), queryFn: () => loadAdminGradingDay(eventId), enabled: Boolean(eventId), retry: false })
  const results = useQuery({ queryKey: adminGradingKeys.results(eventId, sessionId), queryFn: () => loadSessionResults(eventId, sessionId),
    enabled: Boolean(eventId && sessionId), retry: false })
  const back = <GradingBackLink to={`/admin/grading/days/${eventId}`}>Back to grading day</GradingBackLink>

  if (day.isPending) return <div className="space-y-4">{back}<TableSkeleton rows={6} cols={4} label="Loading results…" /></div>
  if (day.isError) return <div className="space-y-4">{back}<RetryAlert message={day.error.message} onRetry={() => void day.refetch()} /></div>
  const session = day.data.sessions.find(item => item.id === sessionId)
  if (!session) return <div className="space-y-4">{back}<GradingNote>This session isn’t part of this grading. It may have been re-sorted.</GradingNote></div>

  return (
    <div className="space-y-4">
      {back}
      <SessionChecklistsView day={day.data} session={session} results={results} scope="all" />
    </div>
  )
}
