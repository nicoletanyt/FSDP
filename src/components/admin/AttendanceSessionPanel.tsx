import { useEffect, useState } from 'react'
import { EventCard } from '@/components/admin/AttendanceCalendar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { AdminCalendarEvent } from '@/lib/admin/attendance-calendar'

export default function AttendanceSessionPanel({
  event,
  focusStudentId,
  onClose,
  dayView = false,
}: {
  event: AdminCalendarEvent
  focusStudentId?: string
  onClose: () => void
  dayView?: boolean
}) {
  const [desktop, setDesktop] = useState(
    () => window.matchMedia('(min-width: 1024px)').matches,
  )

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const update = () => setDesktop(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const details = (
    <EventCard
      key={event.id}
      event={event}
      layout="panel"
      expanded
      focusStudentId={focusStudentId}
      onToggle={onClose}
    />
  )

  if (dayView && !desktop) {
    return (
      <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
        <SheetContent className="gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Session attendance</SheetTitle>
            <SheetDescription className="sr-only">
              Session information, student roster, and attendance actions.
            </SheetDescription>
          </SheetHeader>
          {details}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      aria-label="Session attendance"
      className="flex min-h-0 min-w-0 flex-col overflow-hidden"
    >
      {details}
    </aside>
  )
}
