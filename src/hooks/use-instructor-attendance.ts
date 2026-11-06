import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from './use-auth'
import { useInstructorQuery } from './use-instructor-data'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { parseEntityId } from '@/lib/instructor/adapters'
import { attendanceSnapshot, loadAttendanceRoster } from '@/lib/instructor/attendance'
import { toInstructorDataError } from '@/lib/instructor/errors'
import type { AttendanceMark, AttendanceSaveInput, EventId, StudentId } from '@/lib/instructor/types'

type RosterData = Awaited<ReturnType<typeof loadAttendanceRoster>>
type SaveState = { key: string; pending: boolean; error: string | null; retry: 'write' | 'read'; hide: boolean }

export function useInstructorAttendance(eventId: EventId, enabled: boolean) {
  const api = useInstructorApi()
  const { session, profile } = useAuth()
  const source = useRef({ api, revision: 0 })
  if (source.current.api !== api) source.current = { api, revision: source.current.revision + 1 }
  const load = useCallback((signal: AbortSignal) => loadAttendanceRoster(api, eventId, signal), [api, eventId])
  const query = useInstructorQuery(`roster:${eventId}:${source.current.revision}`, load, enabled)
  const key = JSON.stringify([session?.user.id, profile?.role, eventId, source.current.revision])
  const [saved, setSaved] = useState<{ key: string; api: typeof api; data: RosterData } | null>(null)
  const [saveState, setSaveState] = useState<SaveState | null>(null)
  const request = useRef<AttendanceSaveInput | null>(null)
  const busy = useRef(false)
  const current = useRef({ key, api, mounted: true })
  const readController = useRef<AbortController | null>(null)
  current.current.key = key
  current.current.api = api
  useEffect(() => {
    current.current.mounted = true
    busy.current = false
    request.current = null
    return () => { current.current.mounted = false; readController.current?.abort() }
  }, [key, api])
  const active = saveState?.key === key ? saveState : null
  const data = active?.hide ? null : saved?.key === key && saved.api === api ? saved.data : query.data

  const isCurrent = () => current.current.mounted && current.current.key === key && current.current.api === api

  async function refreshAfterSave() {
    const controller = new AbortController()
    readController.current = controller
    const fresh = await load(controller.signal)
    if (isCurrent()) setSaved({ key, api, data: fresh })
  }

  async function perform(input: AttendanceSaveInput | null) {
    if (busy.current || !isCurrent()) return
    busy.current = true
    let acknowledged = input === null
    setSaveState({ key, pending: true, error: null, retry: 'read', hide: false })
    try {
      if (input) { await api.saveAttendance(input); acknowledged = true }
      if (!isCurrent()) return
      await refreshAfterSave()
      if (isCurrent()) { request.current = null; setSaveState(null) }
    } catch (error) {
      if (!isCurrent()) return
      const failure = toInstructorDataError(error, 'Unable to save attendance. Please retry.')
      const retry = !acknowledged && failure.code === 'request_failed' ? 'write' : 'read'
      setSaveState({ key, pending: false, retry, hide: acknowledged && failure.code === 'forbidden',
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
