import { QueryObserver } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { queryGeneration } from '../query-generation'
import { attendanceEditable, attendanceSnapshot, editableAttendanceRows } from './attendance'
import { invalidateSessionChange } from './cache-invalidation'
import type { InstructorApi } from './calendar-queries'
import { InstructorDataError, toInstructorDataError } from './errors'
import { instructorQueryKeys as keys, instructorQueryTimes as times } from './query-keys'
import type { AttendanceMark, AttendanceSaveInput, AuthUserId, EventId, StudentId } from './types'

type Roster = Awaited<ReturnType<InstructorApi['getAttendanceRoster']>>
type Intent = { status: AttendanceMark; studentId?: StudentId }
export type AttendanceRowWrite = { phase: 'saving' | 'saved' | 'failed'; optimistic?: AttendanceMark; retryable?: boolean }
export type AttendanceWriteState = {
  pending: boolean; refreshing: boolean; bulk: boolean; hide: boolean
  error: string | null; retry: 'write' | 'read'; message: string | null
  rows: Record<string, AttendanceRowWrite>; base?: Roster
}
export const emptyAttendanceWrite: AttendanceWriteState = {
  pending: false, refreshing: false, bulk: false, hide: false,
  error: null, retry: 'read', message: null, rows: {},
}

// One owner per QueryClient/account generation/event, independent of mounted views.
// Pending values are overlays only: expected snapshots always use server reads.
const stores = new WeakMap<QueryClient, Map<string, AttendanceCoordinator>>()

export function attendanceCoordinator(client: QueryClient, api: InstructorApi, userId: AuthUserId, eventId: EventId) {
  let store = stores.get(client)
  if (!store) { store = new Map(); stores.set(client, store) }
  const id = JSON.stringify(keys.attendanceWrite(userId, eventId))
  let coordinator = store.get(id)
  if (!coordinator || !coordinator.current() || coordinator.api !== api) {
    coordinator?.dispose()
    if (coordinator) client.setQueryData(keys.attendanceWrite(userId, eventId), emptyAttendanceWrite)
    coordinator = new AttendanceCoordinator(client, api, userId, eventId, () => store!.delete(id))
    store.set(id, coordinator)
  }
  return coordinator
}

class AttendanceCoordinator {
  private generation: number
  private disposed = false
  private running = false
  private queue: Intent[] = []
  private frozen: AttendanceSaveInput | null = null
  private acknowledged = false
  private unsubscribe: () => void
  private stateKey
  private rosterKey

  constructor(private client: QueryClient, public api: InstructorApi, private userId: AuthUserId,
    private eventId: EventId, private remove: () => void) {
    this.generation = queryGeneration(client)
    this.stateKey = keys.attendanceWrite(userId, eventId)
    this.rosterKey = keys.roster(userId, eventId)
    // Clearing auth queries must also discard private queued intents/retry requests.
    this.unsubscribe = client.getQueryCache().subscribe(event => {
      if (event.type === 'removed' && event.query.queryHash === JSON.stringify(this.stateKey)) this.dispose()
    })
  }

  current() { return !this.disposed && queryGeneration(this.client) === this.generation }
  dispose() {
    if (this.disposed) return
    this.disposed = true; this.queue = []; this.frozen = null; this.acknowledged = false
    this.unsubscribe(); this.remove()
  }
  private state() { return this.client.getQueryData<AttendanceWriteState>(this.stateKey) ?? emptyAttendanceWrite }
  private update(patch: Partial<AttendanceWriteState>) {
    if (this.current()) this.client.setQueryData(this.stateKey, { ...this.state(), ...patch })
  }

  mark(status: AttendanceMark, studentId?: StudentId) {
    if (!this.current() || this.state().error || this.state().bulk) return
    if (studentId && this.state().rows[studentId]?.optimistic === status) return
    const base = this.client.getQueryData<Roster>(this.rosterKey)
    if (!base || !attendanceEditable(base.session.event)) return
    if (studentId && !editableAttendanceRows(base.entries, base.session.event.starts_at).some(entry => entry.record.student_id === studentId)) return
    if (!studentId && (this.running || this.queue.length)) return
    const intent = { status, studentId }
    // Coalesce only unsent work. Never change an already dispatched request.
    const queued = this.queue.findIndex(item => item.studentId === studentId)
    if (queued < 0) this.queue.push(intent)
    else this.queue[queued] = intent
    this.update({ base, pending: true, bulk: !studentId, message: null,
      rows: studentId ? { ...this.state().rows, [studentId]: { phase: 'saving', optimistic: status } } : this.state().rows })
    void this.drain()
  }

  private async reload() {
    if (!this.current()) throw new InstructorDataError('cancelled', 'Account changed.')
    await this.client.cancelQueries({ queryKey: this.rosterKey, exact: true })
    if (!this.current()) throw new InstructorDataError('cancelled', 'Account changed.')
    // Keep the reconciliation read observed if the last view unmounts. Auth
    // clearing still explicitly cancels it through the existing boundary.
    const observer = new QueryObserver(this.client, { queryKey: this.rosterKey, enabled: false })
    const release = observer.subscribe(() => {})
    try {
      return await this.client.fetchQuery({ queryKey: this.rosterKey, ...times.roster, staleTime: 0, retry: false,
        queryFn: async ({ signal }) => {
          if (!this.current()) throw new InstructorDataError('cancelled', 'Account changed.')
          const result = await this.api.getAttendanceRoster(this.eventId, signal)
          signal.throwIfAborted()
          if (!this.current()) throw new InstructorDataError('cancelled', 'Account changed.')
          return result
        } })
    } finally { release() }
  }

  private invalidate(input: AttendanceSaveInput) {
    invalidateSessionChange(this.client, this.generation, this.userId, this.eventId,
      input.expected.map(row => row.studentId), 'attendance', this.current())
  }

  private async perform(input: AttendanceSaveInput | null) {
    let acknowledged = input === null ? this.acknowledged : false
    const affected = this.frozen?.expected.map(row => row.studentId) ?? []
    try {
      if (input) {
        if (!this.current()) return false
        // No paused offline mutation can silently replay after a later login.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new InstructorDataError('request_failed', 'You are offline. Retry when connected.')
        await this.api.saveAttendance(input)
        acknowledged = true
        this.acknowledged = true
        this.invalidate(input)
        if (!this.current()) return false
        if (input.scope === 'student') {
          const rows = { ...this.state().rows }
          const id = input.expected[0].studentId
          if (!this.queue.some(item => item.studentId === id)) rows[id] = { phase: 'saved', optimistic: input.status }
          this.update({ rows })
        }
      }
      if (!this.current()) return false
      this.update({ refreshing: true })
      const base = await this.reload()
      if (!this.current()) return false
      const rows = { ...this.state().rows }
      for (const id of affected) {
        const queued = this.queue.find(item => item.studentId === id)
        if (!acknowledged) delete rows[id]
        else rows[id] = queued ? { phase: 'saving', optimistic: queued.status } : { phase: 'saved' }
      }
      const impact = this.frozen
      const changed = acknowledged && impact?.scope === 'student' && (!base.entries.some(entry => entry.record.student_id === impact.expected[0].studentId)
        || base.entries.some(entry => entry.record.student_id === impact.expected[0].studentId
          && entry.record.attendance_status !== (impact.status === 'unmarked' ? null : impact.status)))
      this.frozen = null
      this.acknowledged = false
      this.update({ base, rows, refreshing: false, bulk: false, error: null, hide: false,
        ...(changed ? { message: 'The server attendance differs from your selection. Current saved values are shown; review before marking again.' } : {}) })
      return true
    } catch (error) {
      if (input && !acknowledged) this.invalidate(input)
      if (!this.current()) return false
      const failure = toInstructorDataError(error, 'Unable to save attendance. Please retry.')
      const rows = { ...this.state().rows }
      for (const id of affected) rows[id] = { phase: 'failed', retryable: true }
      // A failure is an event-wide barrier. Unsent intents are discarded, never
      // silently replayed against a conflicting or uncertain server snapshot.
      for (const item of this.queue) if (item.studentId && !affected.includes(item.studentId)) rows[item.studentId] = { phase: 'failed' }
      this.queue = []
      this.update({ pending: false, refreshing: false, rows, bulk: false,
        hide: failure.code === 'forbidden' || failure.code === 'unauthenticated',
        retry: input && !acknowledged && failure.code === 'request_failed' ? 'write' : 'read',
        error: acknowledged ? `Attendance was saved, but the roster could not reload. ${failure.message}`
          : input && failure.code === 'request_failed' ? `${failure.message} The save outcome may be unknown; Retry save uses the same request.` : failure.message,
        message: 'Last confirmed values are shown, not verified server truth. Queued changes were stopped. Reload or retry before marking again.' })
      return false
    }
  }

  private async drain() {
    if (this.running || !this.current() || this.state().error) return
    this.running = true
    try {
      while (this.current() && this.queue.length) {
        const intent = this.queue.shift()!
        const base = this.client.getQueryData<Roster>(this.rosterKey)
        if (!base) break
        const entries = intent.studentId ? base.entries.filter(entry => entry.record.student_id === intent.studentId) : base.entries
        this.acknowledged = false
        this.frozen = { requestId: crypto.randomUUID(), expectedUserId: this.userId, eventId: this.eventId,
          scope: intent.studentId ? 'student' : 'roster', status: intent.status, expected: entries.map(entry => attendanceSnapshot(entry.record)) }
        if (!await this.perform(this.frozen)) return
      }
      this.update({ pending: false, refreshing: false })
    } finally { this.running = false }
  }

  async retry() {
    if (!this.current() || this.running || !this.state().error) return
    this.running = true
    const input = this.state().retry === 'write' ? this.frozen : null
    const conflict = this.state().retry === 'read'
    const rows = { ...this.state().rows }
    if (input?.scope === 'student') rows[input.expected[0].studentId] = { phase: 'saving', optimistic: input.status }
    this.update({ pending: true, refreshing: input === null, error: null, rows })
    try {
      if (await this.perform(input)) this.update({ pending: false,
        message: this.state().message?.startsWith('The server attendance differs') ? this.state().message
          : conflict ? 'Server attendance reloaded. Review the saved values before marking again.' : 'Attendance verified. Reapply any stopped changes.' })
    } finally { this.running = false }
  }
}
