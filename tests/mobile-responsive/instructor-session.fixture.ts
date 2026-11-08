// Test-only stored reports and event/student assessments.
import { InstructorDataError } from '../../src/lib/instructor/errors'
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { EventId, EventStudentRow, InstructorRow, SessionReportEntry } from '../../src/lib/instructor/types'

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const metadata = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const author: InstructorRow = { id: uuid(40) as InstructorRow['id'], user_id: null, first_name: 'Actual', last_name: 'Report Author', email: 'author@example.test', ...metadata }

export function createSessionFixtureReads(mode: string | null, readEvent: InstructorApi['getEvent'], readRoster: InstructorApi['getRoster'], writes?: {
  decorate: (record: EventStudentRow) => EventStudentRow; author: (id: EventStudentRow['report_author_id'], fallback: InstructorRow | null) => InstructorRow | null; saved: Set<string>
}): Pick<InstructorApi, 'getSessionReports' | 'getAssessment'> {
  const failed = new Set<string>()
  async function state(resource: string, slow = false) {
    if (mode === `${resource}-loading` || slow) await new Promise(resolve => setTimeout(resolve, 1600))
    if (mode === `${resource}-forbidden`) throw new InstructorDataError('forbidden', 'Instructor access to this session is required.')
    if ((mode === `${resource}-error` || (mode === 'reports-page-error' && slow)) && !failed.has(resource)) {
      failed.add(resource)
      throw new InstructorDataError('request_failed', `${resource} could not be loaded.`)
    }
  }
  return {
    async getSessionReports(id, options = {}) {
      await state('reports', (mode === 'reports-page-error' && (options.offset ?? 0) > 0)
        || (mode === 'reports-race' && id === '00000000-0000-4000-8000-202611020001'))
      const session = await readEvent(id, options.signal)
      const roster = await readRoster(id, options)
      if (!session || !roster) throw new InstructorDataError('forbidden', 'Session unavailable.')
      if (mode === 'reports-empty') return { ...roster, items: [], total: 0 }
      const items: SessionReportEntry[] = roster.items.map((entry, index) => ({
        ...entry,
        record: { ...entry.record, report: index < 2 ? `Stored current report for ${entry.student.student.member_no} · ${id}` : null,
          report_author_id: index === 0 ? author.id : null },
        reportAuthor: index === 0 ? author : null,
        previousReports: index < 2 ? [0, 1].map(offset => {
          const eventId = uuid(6000 + offset) as EventId
          return { event: { ...session.event, id: eventId, name: `Actual earlier class ${offset + 1}`, starts_at: `2026-10-${20 - offset}T02:00:00Z`, ends_at: `2026-10-${20 - offset}T03:00:00Z` },
            record: { ...entry.record, event_id: eventId, report: `Actual earlier feedback ${offset + 1} for ${entry.student.student.member_no}`, report_author_id: offset === 0 ? author.id : null },
            centre: session.centre ? { ...session.centre, name: 'Other Dojo' } : null, instructor: null, reportAuthor: offset === 0 ? author : null,
            grading: null, targetGrade: null }
        }) : [],
      })).map(entry => {
        if (writes) { entry.record = writes.decorate(entry.record); entry.reportAuthor = writes.author(entry.record.report_author_id, entry.reportAuthor) }
        return entry
      })
      return { ...roster, items }
    },
    async getAssessment(key, signal) {
      if (mode === 'assessment-postread-error' && writes?.saved.has('assessment') && !failed.has('postread')) {
        failed.add('postread'); throw new InstructorDataError('request_failed', 'Saved assessment could not be reloaded.')
      }
      await state('assessment', mode === 'assessment-race' && key.studentId === uuid(100))
      const session = await readEvent(key.eventId, signal)
      if (!session || session.event.event_type !== 'grading' || mode === 'assessment-missing') return null
      const roster = await readRoster(key.eventId, { signal, limit: 100 })
      const entry = roster?.items.find(item => item.student.student.id === key.studentId)
      if (!entry) return null
      const targetGrade = { id: 'recorded-application-target', label: 'Recorded application grade', colour: 'Blue', is_ranked: true, sort_order: 99 }
      const application = mode === 'assessment-no-application' ? null : { id: uuid(6100), student_id: key.studentId,
        grading_event_id: key.eventId, target_grade_id: targetGrade.id, submitted_at: metadata.created_at, status: 'submitted' as const, notes: null }
      const record = { ...entry.record, assessment_status: mode === 'assessment-unrecorded' ? null : key.studentId === uuid(101) ? 'completed' as const : 'pending' as const,
        assessment_notes: mode === 'assessment-unrecorded' ? null : `Stored assessment notes for ${key.studentId}` }
      return { ...entry, session, application, targetGrade: !application || mode === 'assessment-unknown-grade' ? null : targetGrade,
        record: writes ? writes.decorate(record) : record }
    },
  }
}
