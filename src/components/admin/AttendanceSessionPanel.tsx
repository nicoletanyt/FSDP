import { EventCard } from '@/components/admin/AttendanceCalendar'
import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'

export default function AttendanceSessionPanel({
  event,
  focusStudentId,
  onClose,
}: {
  event: AdminCalendarEvent
  focusStudentId?: string
  onClose: () => void
}) {
  return (
    <aside
      aria-label="Session attendance"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden"
    >
      <EventCard
        key={event.id}
        event={event}
        layout="panel"
        expanded
        focusStudentId={focusStudentId}
        onToggle={onClose}
      />
    </aside>
  )
}
