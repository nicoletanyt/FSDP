import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'
import { cn } from 'cn'
import CoverCandidatePreview from './CoverCandidatePreview'

export default function LiveClassDetails({ event, fillHeight = false }: {
  event: AdminCalendarEvent
  fillHeight?: boolean
}) {
  const details = event.liveDetails
  if (!details) return null
  return (
    <div
      className={cn('flex flex-col border-t border-foreground/10 bg-background p-4 text-sm',
        fillHeight && 'min-h-0 flex-1 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring')}
      role={fillHeight ? 'region' : undefined}
      tabIndex={fillHeight ? 0 : undefined}
      aria-label={fillHeight ? 'Class details and nearby instructor preview' : undefined}
    >
      <h4 className="mb-3 font-semibold">Class details</h4>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <dt className="text-muted-foreground">Type</dt><dd>{details.classType}</dd>
        <dt className="text-muted-foreground">Instructor</dt><dd>{event.instructorName}</dd>
        <dt className="text-muted-foreground">Students</dt><dd>{event.rosterCount ?? 0}</dd>
      </dl>
      {details.unavailability?.status === 'open' && <CoverCandidatePreview eventId={details.eventId} className={event.name}
        startsAt={details.startsAt} endsAt={details.endsAt} />}
    </div>
  )
}
