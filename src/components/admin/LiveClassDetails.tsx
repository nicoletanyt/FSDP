import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'
import { cn } from 'cn'

const classTime = (value: string) => new Date(value).toLocaleTimeString('en-US', {
  timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit',
})

export default function LiveClassDetails({ event, fillHeight = false }: {
  event: AdminCalendarEvent
  fillHeight?: boolean
}) {
  const details = event.liveDetails
  if (!details) return null
  return (
    <div className={cn('border-t border-foreground/10 bg-background p-4 text-sm', fillHeight && 'min-h-0 flex-1')}>
      <h4 className="mb-3 font-semibold">Class details</h4>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <dt className="text-muted-foreground">Type</dt><dd>{details.classType}</dd>
        <dt className="text-muted-foreground">Dojo</dt><dd>{event.centreName}</dd>
        <dt className="text-muted-foreground">Instructor</dt><dd>{event.instructorName}</dd>
        <dt className="text-muted-foreground">Starts</dt><dd>{classTime(details.startsAt)}</dd>
        <dt className="text-muted-foreground">Ends</dt><dd>{classTime(details.endsAt)}</dd>
        <dt className="text-muted-foreground">Status</dt><dd className="capitalize">{details.status}</dd>
        <dt className="text-muted-foreground">Students</dt><dd>{event.rosterCount ?? 0}</dd>
        <dt className="text-muted-foreground">Event ID</dt><dd className="break-all text-xs">{details.eventId}</dd>
      </dl>
      {details.unavailability?.status === 'open' && <div role="status" className="mt-4 space-y-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
        <p className="font-medium">Instructor unavailable · cover needed</p>
        <p>Reported by {details.unavailability.reportedBy}.</p>
        <p>{details.unavailability.notification_status === 'accepted'
          ? 'EmailJS accepted the admin alert; inbox delivery is not confirmed.'
          : details.unavailability.notification_status === 'failed'
            ? 'Admin email was rejected. Contact the instructor directly.'
            : details.unavailability.notification_status === 'sending'
              ? 'Admin email status is uncertain. Review before retrying.'
              : 'Admin email has not been sent yet.'}</p>
      </div>}
    </div>
  )
}
