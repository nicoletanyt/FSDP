import { AvailabilityDialog } from './CalendarAvailability'
import { useInstructorAvailabilitySave } from '@/hooks/use-instructor-availability-save'
import type { AvailabilityRange, AvailabilitySlot } from '@/lib/instructor-availability'
import type { CalendarEventsForDate } from '@/lib/instructor/calendar-view'

export default function InstructorAvailabilityEditor({ initial, editingId, slots, getEvents, onClose, onSaved }: {
  initial: AvailabilityRange
  editingId?: string
  slots: AvailabilitySlot[]
  getEvents: CalendarEventsForDate
  onClose: () => void
  onSaved: (range: AvailabilityRange, id: string | null) => void
}) {
  const mutation = useInstructorAvailabilitySave(initial, editingId)
  return <AvailabilityDialog initial={initial} editingId={editingId} slots={slots} getEvents={getEvents}
    onClose={onClose} onReload={editingId ? mutation.reload : undefined}
    onSave={async range => {
      const slot = await mutation.save(range)
      if (mutation.isCurrent()) onSaved(range, slot?.id ?? null)
    }} onDelete={editingId ? async () => {
      await mutation.remove()
      if (mutation.isCurrent()) onSaved(initial, null)
    } : undefined} />
}
