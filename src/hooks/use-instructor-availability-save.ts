import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { parseEntityId } from '@/lib/instructor/adapters'
import { calendarDateValue, toCalendarAvailability } from '@/lib/instructor/calendar-view'
import { invalidateAvailability } from '@/lib/instructor/cache-invalidation'
import { InstructorDataError, toInstructorDataError } from '@/lib/instructor/errors'
import { queryGeneration } from '@/lib/query-generation'
import type { AvailabilityRange } from '@/lib/instructor-availability'
import type { AvailabilitySaveInput } from '@/lib/instructor/types'

const valueOf = (range: AvailabilityRange) => ({
  date: calendarDateValue(range.date), startTime: range.startTime, endTime: range.endTime,
})

// Mounted once per dialog. Keep the opening snapshot separate from the query
// cache: a background refresh must never silently overwrite our concurrency check.
export function useInstructorAvailabilitySave(initial: AvailabilityRange, slotId?: string) {
  const api = useInstructorApi()
  const client = useQueryClient()
  const { session, profile } = useAuth()
  const userId = session?.user.id
  const generation = queryGeneration(client)
  const key = JSON.stringify([userId, profile?.role, slotId, generation])
  const current = useRef({ key, api, mounted: true })
  current.current.key = key
  current.current.api = api
  const expected = useRef(initial.snapshot ?? valueOf(initial))
  const frozen = useRef<AvailabilitySaveInput | null>(null)
  const busy = useRef(false)
  useEffect(() => {
    current.current.mounted = true
    return () => { current.current.mounted = false }
  }, [])
  const isCurrent = () => current.current.mounted && current.current.key === key
    && current.current.api === api && queryGeneration(client) === generation

  async function perform(kind: 'update' | 'delete', range = initial) {
    if (!isCurrent() || !userId || profile?.role !== 'instructor') {
      throw new InstructorDataError('cancelled', 'Your account changed. Reopen availability before trying again.')
    }
    if (busy.current) throw new InstructorDataError('invalid_request', 'An availability change is already in progress.')
    busy.current = true
    try {
      let slot
      if (slotId) {
        if (!frozen.current) {
          const base = { requestId: crypto.randomUUID(), expectedUserId: parseEntityId(userId, 'auth-user'), slotId, expected: { ...expected.current } }
          frozen.current = kind === 'update' ? { ...base, kind, value: valueOf(range) } : { ...base, kind }
        }
        // Ambiguous failures retry the *exact* request, including its snapshot.
        slot = (await api.saveAvailability(frozen.current)).slot
      } else {
        slot = await api.createAvailability(valueOf(range))
      }
      if (!isCurrent()) throw new InstructorDataError('cancelled', 'Your account changed.')
      frozen.current = null
      return slot
    } catch (error) {
      const failure = toInstructorDataError(error, 'Unable to save your availability. Please retry.')
      if (failure.code !== 'request_failed' && failure.code !== 'invalid_data') frozen.current = null
      throw failure
    } finally {
      invalidateAvailability(client, generation, userId)
      busy.current = false
    }
  }

  async function reload() {
    if (!slotId || !isCurrent()) throw new InstructorDataError('cancelled', 'Reopen availability before trying again.')
    const slot = await api.getAvailabilitySlot(slotId)
    if (!isCurrent()) throw new InstructorDataError('cancelled', 'Your account changed.')
    if (!slot) throw new InstructorDataError('forbidden', 'This availability was removed or is no longer accessible. Close this dialog to return to the calendar.')
    expected.current = { date: slot.date, startTime: slot.start_time, endTime: slot.end_time }
    frozen.current = null
    return toCalendarAvailability(slot)
  }

  return { save: (range: AvailabilityRange) => perform('update', range), remove: () => perform('delete'), reload, isCurrent }
}
