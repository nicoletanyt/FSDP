import { useQuery } from '@tanstack/react-query'
import { TableSkeleton } from '@/components/shared/skeletons'
import { useParams } from 'react-router'
import SessionChecklistsView from '@/components/grading/SessionChecklistsView'
import { GradingNote } from '@/components/grading/GradingParts'
import { BackNav } from '@/components/shared/layout/BackLink'
import RetryAlert from '@/components/shared/layout/RetryAlert'
import { adminGradingKeys, loadAdminGradingDay, loadSessionResults } from '@/lib/admin/grading-results'

export default function AdminGradingResults() {
  const { eventId = '', sessionId = '' } = useParams()
  const day = useQuery({ queryKey: adminGradingKeys.day(eventId), queryFn: () => loadAdminGradingDay(eventId), enabled: Boolean(eventId), retry: false })
  const results = useQuery({ queryKey: adminGradingKeys.results(eventId, sessionId), queryFn: () => loadSessionResults(eventId, sessionId),
    enabled: Boolean(eventId && sessionId), retry: false })
  const session = day.data?.sessions.find(item => item.id === sessionId)

  return (
    <div className="space-y-4">
      <BackNav to={`/admin/grading/days/${eventId}`} label="Back to grading day">
        {day.isPending ? <TableSkeleton rows={6} cols={4} label="Loading results…" />
          : day.isError ? <RetryAlert message={day.error.message} onRetry={() => void day.refetch()} />
          : !session ? <GradingNote>This session isn’t part of this grading. It may have been re-sorted.</GradingNote>
          : <SessionChecklistsView day={day.data} session={session} results={results} scope="all" />}
      </BackNav>
    </div>
  )
}
