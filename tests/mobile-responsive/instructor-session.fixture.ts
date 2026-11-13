// Test-only stored event/student assessments.
import { InstructorDataError } from '../../src/lib/instructor/errors'
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { EventStudentRow } from '../../src/lib/instructor/types'

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const metadata = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }

export function createSessionFixtureReads(mode: string | null, readEvent: InstructorApi['getEvent'], readRoster: InstructorApi['getRoster'], writes?: {
  decorate: (record: EventStudentRow) => EventStudentRow; saved: Set<string>
}): Pick<InstructorApi, 'getAssessment'> {
  const failed = new Set<string>()
  let postreadFailures = 0
  async function state(resource: string, slow = false) {
    if (mode === `${resource}-loading` || slow) await new Promise(resolve => setTimeout(resolve, 1600))
    if (mode === `${resource}-forbidden`) throw new InstructorDataError('forbidden', 'Instructor access to this session is required.')
    if (mode === `${resource}-error` && !failed.has(resource)) {
      failed.add(resource)
      throw new InstructorDataError('request_failed', `${resource} could not be loaded.`)
    }
  }
  return {
    async getAssessment(key, signal) {
      // The invalidated parent query and the mutation's authoritative read both
      // run after acknowledgement. Fail both so recovery is deterministic.
      if (mode === 'assessment-postread-error' && writes?.saved.has('assessment') && postreadFailures++ < 2) {
        throw new InstructorDataError('request_failed', 'Saved assessment could not be reloaded.')
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
