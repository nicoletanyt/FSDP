// Test-only stored session writes/receipts. Production code has no browser store.
import { InstructorDataError } from '../../src/lib/instructor/errors'
import { assessmentSnapshot, reportEditable, reportSnapshot } from '../../src/lib/instructor/session-writes'
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { EventStudentRow, InstructorRow, ReportDetail, SessionSaveInput, SessionSaveResult } from '../../src/lib/instructor/types'

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
declare global { interface Window { sessionWriteRequestsFixture: SessionSaveInput[] } }

export function createSessionWriteFixture(account: string, mode: string | null, getApi: () => InstructorApi) {
  const ownInstructor: InstructorRow = { id: uuid(account === 'audit' ? 1 : 2) as InstructorRow['id'], user_id: uuid(account === 'audit' ? 90001 : 90002) as InstructorRow['user_id'],
    first_name: 'Test', last_name: 'Instructor', email: 'writer@example.test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
  const storageKey = `test-only-session-writes:${account}`
  const overrides = new Map<string, Partial<EventStudentRow>>(mode?.endsWith('-persistence') ? JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') : [])
  const receipts = new Map<string, { input: string; result: SessionSaveResult }>()
  const failed = new Set<string>()
  const saved = new Set<string>()
  const requests: SessionSaveInput[] = []
  window.sessionWriteRequestsFixture = requests
  const decorate = (record: EventStudentRow) => ({ ...record, ...overrides.get(`${record.event_id}:${record.student_id}`) })
  const author = (id: EventStudentRow['report_author_id'], fallback: InstructorRow | null) => id === ownInstructor.id ? ownInstructor : fallback?.id === id ? fallback : null

  async function getReport(key: Parameters<InstructorApi['getReport']>[0]): Promise<ReportDetail | null> {
    if (mode === 'report-postread-error' && saved.has('report') && !failed.has('postread')) {
      failed.add('postread'); throw new InstructorDataError('request_failed', 'Saved report could not be reloaded.')
    }
    const api = getApi()
    if (mode?.startsWith('report-')) {
      const history = await api.getStudentHistory(key.studentId, { limit: 100 })
      const item = history.items.find(entry => entry.record.event_id === key.eventId)
      const student = await api.getStudentDetail(key.studentId)
      if (!item || !student) return null
      return { record: decorate(item.record), student, reportAuthor: author(item.record.report_author_id, item.reportAuthor),
        session: { event: item.event, centre: item.centre, classType: null, grading: null, targetGrades: [], seminar: null, workshop: null, rosterCount: 1 } }
    }
    const session = await api.getEvent(key.eventId)
    if (!session || session.event.event_type !== 'class') return null
    const page = await api.getSessionReports(key.eventId, { limit: 100 })
    const item = page.items.find(entry => entry.record.student_id === key.studentId)
    return item ? { ...item, session, record: decorate(item.record), reportAuthor: author(item.record.report_author_id, item.reportAuthor) } : null
  }

  async function perform(input: SessionSaveInput): Promise<SessionSaveResult> {
    requests.push(structuredClone(input))
    const kind = input.kind
    await new Promise(resolve => setTimeout(resolve, mode === `${kind}-slow` ? 1600 : 150))
    if (input.expectedUserId !== ownInstructor.user_id || mode === 'unlinked') throw new InstructorDataError('forbidden', 'Account or instructor link changed.')
    const receipt = receipts.get(input.requestId)
    if (receipt) {
      if (receipt.input !== JSON.stringify(input)) throw new InstructorDataError('conflict', 'Request changed. Reload the saved record.')
      return receipt.result
    }
    if (mode === `${kind}-save-error` && !failed.has(kind)) { failed.add(kind); throw new InstructorDataError('request_failed', 'The record could not be saved. Please retry.') }
    const current = input.kind === 'report' ? await getReport(input) : await getApi().getAssessment(input)
    if (!current || current.session.event.instructor_id !== ownInstructor.id) throw new InstructorDataError('forbidden', 'Event is not assigned to you.')
    if (current.session.event.status === 'cancelled') throw new InstructorDataError('forbidden', 'Cancelled sessions are read-only.')
    const key = `${input.eventId}:${input.studentId}`
    if (mode === `${kind}-conflict` && !failed.has(kind)) {
      failed.add(kind)
      overrides.set(key, kind === 'report' ? { report: 'Newer server report', report_author_id: ownInstructor.id } : { assessment_status: 'pending', assessment_notes: 'Newer server notes' })
      throw new InstructorDataError('conflict', 'This record changed while you were editing. Reload the saved record; your draft is kept.')
    }
    const expected = input.kind === 'report' ? reportSnapshot(current.record) : assessmentSnapshot(current.record)
    if (JSON.stringify(expected) !== JSON.stringify(input.expected)) throw new InstructorDataError('conflict', 'This record changed. Reload the saved record.')
    const base = { requestId: input.requestId, eventId: input.eventId, studentId: input.studentId }
    let result: SessionSaveResult
    if (input.kind === 'report') {
      if (!reportEditable(current.session.event, current.record, ownInstructor.id)) throw new InstructorDataError('forbidden', 'Only the recorded report author may edit this report.')
      const report = input.report?.trim() || null
      overrides.set(key, { ...overrides.get(key), report, report_author_id: ownInstructor.id })
      result = { ...base, kind: 'report', value: { report, reportAuthorId: ownInstructor.id } }
    } else {
      const notes = input.notes?.trim() || null
      overrides.set(key, { ...overrides.get(key), assessment_status: input.status, assessment_notes: notes })
      result = { ...base, kind: 'assessment', value: { status: input.status, notes } }
    }
    receipts.set(input.requestId, { input: JSON.stringify(input), result }); saved.add(kind)
    if (mode?.endsWith('-persistence')) sessionStorage.setItem(storageKey, JSON.stringify([...overrides]))
    if ((mode === `${kind}-lost-response` || mode === `${kind}-retry-after-change`) && !failed.has(kind)) {
      failed.add(kind)
      if (mode === `${kind}-retry-after-change`) overrides.set(key, kind === 'report'
        ? { report: 'Newer server report', report_author_id: ownInstructor.id } : { assessment_status: 'pending', assessment_notes: 'Newer server notes' })
      throw new InstructorDataError('request_failed', 'The save response was lost. Please retry.')
    }
    return result
  }

  return { ownInstructor, decorate, author,
    methods: {
      async getCurrentInstructor() {
        if (mode === 'unlinked') throw new InstructorDataError('instructor_not_found', 'No instructor link.')
        return { userId: ownInstructor.user_id!, instructorId: ownInstructor.id, name: 'Test Instructor', email: ownInstructor.email }
      },
      getReport,
      saveReport: (input: Parameters<InstructorApi['saveReport']>[0]) => perform({ ...input, kind: 'report' }),
      saveAssessment: (input: Parameters<InstructorApi['saveAssessment']>[0]) => perform({ ...input, kind: 'assessment' }),
    },
    saved,
  }
}
