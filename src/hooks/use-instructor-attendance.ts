import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useInstructorRoster } from './use-instructor-class-queries'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { parseEntityId } from '@/lib/instructor/adapters'
import { attendanceSnapshot } from '@/lib/instructor/attendance'
import { toInstructorDataError } from '@/lib/instructor/errors'
import { invalidateSessionChange } from '@/lib/instructor/cache-invalidation'
import { queryGeneration } from '@/lib/query-generation'
import type { AttendanceMark, AttendanceSaveInput, EventId, StudentId } from '@/lib/instructor/types'

type SaveState = { key: string; pending: boolean; error: string | null; retry: 'write' | 'read'; hide: boolean }

export function useInstructorAttendance(eventId: EventId, enabled: boolean) {
  const api = useInstructorApi()
  const client = useQueryClient()
  const { session, profile } = useAuth()
  const source = useRef({ api, revision: 0 })
  if (source.current.api !== api) source.current = { api, revision: source.current.revision + 1 }
  const roster = useInstructorRoster(eventId, enabled)
  const key = JSON.stringify([session?.user.id, profile?.role, eventId, source.current.revision])
  const [saveState, setSaveState] = useState<SaveState | null>(null)
  const request = useRef<AttendanceSaveInput | null>(null)
  const busy = useRef(false)
  const current = useRef({ key, api, mounted: true })
  current.current.key = key
  current.current.api = api
  useEffect(() => {
    current.current.mounted = true
    busy.current = false
    request.current = null
    return () => { current.current.mounted = false }
  }, [key, api])
  const active = saveState?.key === key ? saveState : null
  const data = active?.hide ? null : roster.data
  // Keep the existing save/error presentation while the invalidated roster is
  // hidden; otherwise the query's loading/error states remain authoritative.
  const query = active ? { ...roster, status: 'success' as const } : roster

  const isCurrent = () => current.current.mounted && current.current.key === key && current.current.api === api

  async function perform(input: AttendanceSaveInput | null) {
    if (busy.current || !isCurrent()) return
    busy.current = true
    let acknowledged = input === null
    const generation = queryGeneration(client)
    setSaveState({ key, pending: true, error: null, retry: 'read', hide: false })
    try {
      if (input) {
        await api.saveAttendance(input)
        acknowledged = true
        invalidateSessionChange(client, generation, input.expectedUserId, eventId, input.expected.map(row => row.studentId), 'attendance', isCurrent())
      }
      if (!isCurrent()) return
      setSaveState({ key, pending: true, error: null, retry: 'read', hide: true })
      await roster.reload()
      if (isCurrent()) { request.current = null; setSaveState(null) }
    } catch (error) {
      if (input && !acknowledged) {
        invalidateSessionChange(client, generation, input.expectedUserId, eventId, input.expected.map(row => row.studentId), 'attendance', isCurrent())
      }
      if (!isCurrent()) return
      const failure = toInstructorDataError(error, 'Unable to save attendance. Please retry.')
      const retry = !acknowledged && failure.code === 'request_failed' ? 'write' : 'read'
      setSaveState({ key, pending: false, retry, hide: true,
        error: acknowledged && input ? `Attendance was saved, but the roster could not reload. ${failure.message}` : failure.message })
    } finally {
      if (isCurrent()) busy.current = false
    }
  }

  function mark(status: AttendanceMark, studentId?: StudentId) {
    if (busy.current || !isCurrent() || active?.error || !data || !session || profile?.role !== 'instructor') return
    const entries = studentId ? data.entries.filter(entry => entry.record.student_id === studentId) : data.entries
    if (!entries.length) return
    const input: AttendanceSaveInput = { requestId: crypto.randomUUID(), expectedUserId: parseEntityId(session.user.id, 'auth-user'),
      eventId, scope: studentId ? 'student' : 'roster', status, expected: entries.map(entry => attendanceSnapshot(entry.record)) }
    request.current = input
    void perform(input)
  }

  function retry() {
    void perform(active?.retry === 'write' ? request.current : null)
  }

  return { query, data, pending: active?.pending ?? false, error: active?.error ?? null,
    retryLabel: active?.retry === 'write' ? 'Retry save' : 'Reload attendance', mark, retry }
}
