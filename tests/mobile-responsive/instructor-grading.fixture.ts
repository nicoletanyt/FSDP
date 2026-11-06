// Stored-row-shaped grading reads, injected only by the browser fixture.
import { directoryEntries } from './instructor-directory.fixture'
import { InstructorDataError } from '../../src/lib/instructor/errors'
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { GradingRow, InstructorReferenceData, StudentHistoryEntry, StudentId } from '../../src/lib/instructor/types'

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const target = { id: 'stored-target-grade', label: 'Stored next grade', colour: 'Blue', is_ranked: true, sort_order: 100 }
const syllabus = { id: 'database/adult/stored-target/basics/one', grade_id: target.id, category: 'Basics', label: 'Stored assessment technique', sort_order: 1, note: 'Stored syllabus note' }

export function createGradingFixtureReads(account: string, mode: string | null): Pick<InstructorApi, 'getReferenceData' | 'getTechniqueSignOffs' | 'getRecordedAssessments'> {
  const failed = new Set<string>()
  async function ready(resource: string, id?: StudentId) {
    if (mode === 'grading-loading' || (mode === 'grading-race' && id === uuid(100))) await new Promise(resolve => setTimeout(resolve, 1600))
    if (account !== 'audit') await new Promise(resolve => setTimeout(resolve, 800))
    if (mode === `grading-${resource}-error` && !failed.has(resource)) {
      failed.add(resource)
      throw new InstructorDataError('request_failed', `Grading ${resource} could not be loaded.`)
    }
  }
  return {
    async getReferenceData() {
      await ready('reference')
      const grades = [...new Map(directoryEntries().map(entry => [entry.grade!.id, entry.grade!])).values(), target]
      const reference: InstructorReferenceData = { centres: [], classTypes: [], grades,
        gradeTracks: grades.flatMap(grade => (['children', 'adult'] as const).map(track => ({ grade_id: grade.id, track }))),
        gradeRequirements: grades.flatMap(grade => (['children', 'adult'] as const).map(track => ({ grade_id: grade.id, track, min_months: 3, max_months: null, min_sessions: 10, min_age_years: null }))),
        syllabusItems: (['children', 'adult'] as const).map(track => ({ ...syllabus, track, id: `${track}/${syllabus.id}` })),
      }
      // Only the current and target grades participate in these fixture ladders.
      reference.gradeTracks = reference.gradeTracks.filter(item => item.grade_id === directoryEntries()[0].grade!.id || item.grade_id === target.id)
      if (mode === 'grading-missing-rules') reference.gradeRequirements = []
      if (mode === 'grading-terminal') reference.gradeTracks = reference.gradeTracks.filter(item => item.grade_id !== target.id)
      return reference
    },
    async getTechniqueSignOffs(id) {
      await ready('signoffs', id)
      if (mode === 'grading-ready' || mode === 'grading-empty') return []
      return [{ signOff: { id: uuid(9100), student_id: id, syllabus_item_id: `children/${syllabus.id}`,
        signed_off_at: '2026-11-01T17:00:00Z', signed_off_by: null, note: 'Stored sign-off note' }, instructor: null }]
    },
    async getRecordedAssessments(id, options = {}) {
      await ready('history', id)
      const centre = directoryEntries()[0].centre!
      const items: StudentHistoryEntry[] = mode === 'grading-empty' ? [] : Array.from({ length: mode === 'grading-history-large' ? 205 : 2 }, (_, index) => {
        const eventId = uuid(9200 + index) as StudentHistoryEntry['event']['id']
        const date = new Date(Date.parse('2026-10-20T00:00:00Z') - index * 86_400_000).toISOString().slice(0, 10)
        const grading: GradingRow = { event_id: eventId, track: 'children', grading_date: date, application_deadline: null,
          application_status: 'closed', application_opens_on: null, reporting_release_on: null, reporting_time: null, official_schedule: false }
        return { record: { event_id: eventId, student_id: id, assessment_status: index % 2 ? 'completed' : 'pending',
          assessment_notes: `${mode === 'grading-race' ? id === uuid(100) ? 'Original student' : 'New student' : account === 'audit' ? 'Stored' : 'Replacement account'} assessment notes ${index + 1}`,
          attendance_status: null, report: null, report_author_id: null, recorded_at: null, checked_in_at: null },
        event: { id: eventId, event_type: 'grading', name: `${account === 'audit' ? 'Stored' : 'Replacement'} grading ${index + 1}`, centre_id: centre.id,
          instructor_id: null, starts_at: null, ends_at: null, status: 'completed', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        grading, centre, instructor: null, reportAuthor: null, targetGrade: index % 2 ? target : null }
      })
      const offset = options.offset ?? 0
      return { items: items.slice(offset, offset + Math.min(options.limit ?? 50, 40)), offset, limit: options.limit ?? 50, total: items.length }
    },
  }
}
