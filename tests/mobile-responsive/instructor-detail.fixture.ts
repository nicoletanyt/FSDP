// Test-only profile/history/aggregate reads through the production API context.
import { directoryEntries } from './instructor-directory.fixture'
import { InstructorDataError } from '../../src/lib/instructor/errors'
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { CentreRow, EventId, InstructorId, InstructorRow, StudentHistoryEntry, StudentId } from '../../src/lib/instructor/types'

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const metadata = { created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
const teacher: InstructorRow = { id: uuid(2) as InstructorId, user_id: null, first_name: 'Class', last_name: 'Teacher', email: 'teacher@example.test', ...metadata }
const author: InstructorRow = { ...teacher, id: uuid(3) as InstructorId, first_name: 'Visiting', last_name: 'Author' }

export function createDetailFixtureReads(account: string, mode: string | null): Pick<InstructorApi, 'getStudentDetail' | 'getStudentHistory' | 'getStudentSummary'> {
  const failed = new Set<string>()
  async function delayOrFail(resource: string, id: StudentId) {
    if (mode === 'detail-loading' || (mode === 'detail-race' && id === uuid(100))) await new Promise(resolve => setTimeout(resolve, 2000))
    if (account !== 'audit') await new Promise(resolve => setTimeout(resolve, 800))
    if (mode === `${resource}-error` && !failed.has(resource)) { failed.add(resource); throw new InstructorDataError('request_failed', `${resource} could not be loaded.`) }
  }
  function history(id: StudentId): StudentHistoryEntry[] {
    if (mode === 'detail-empty' || id === uuid(8000)) return []
    const centre = directoryEntries()[0].centre!
    return Array.from({ length: mode === 'detail-history-large' ? 205 : 25 }, (_, index) => {
      const eventId = uuid(5000 + index) as EventId
      const starts = Date.parse('2026-11-02T10:00:00+08:00') - index * 86_400_000
      const attendance = (['present', 'late', 'absent', 'excused', null] as const)[index % 5]
      const report = index % 3 === 0 ? `${account === 'audit' ? 'Stored' : 'Replacement account'} feedback ${index + 1}` : null
      return {
        record: { event_id: eventId, student_id: id, attendance_status: attendance, report,
          report_author_id: report && index !== 3 ? author.id : null, recorded_at: null, checked_in_at: null, assessment_status: null, assessment_notes: null },
        event: { id: eventId, name: `Stored class ${index + 1}`, event_type: 'class', centre_id: centre.id, instructor_id: teacher.id,
          starts_at: new Date(starts).toISOString(), ends_at: new Date(starts + 3_600_000).toISOString(), status: 'completed', ...metadata },
        centre: index % 2 ? { ...centre, id: uuid(12) as CentreRow['id'], name: 'Other Dojo' } : centre,
        instructor: teacher, reportAuthor: report && index !== 3 ? author : null, targetGrade: null, grading: null,
      }
    })
  }
  return {
    async getStudentDetail(id) {
      await delayOrFail('detail', id)
      if (mode === 'detail-missing') return null
      let entry = directoryEntries().find(item => item.student.id === id)
      if (id === uuid(8000)) {
        const base = directoryEntries()[0]
        entry = { ...base, student: { ...base.student, id, first_name: 'Unassigned', last_name: 'Student', membership_status: 'expired' } }
      }
      if (!entry) return null
      const missing = mode === 'detail-optional'
      if (mode === 'grading-ready') entry = { ...entry, student: { ...entry.student, last_graded_at: '2026-01-01' } }
      return { ...entry, grade: missing ? null : entry.grade, centre: missing ? null : entry.centre,
        student: account === 'audit' ? entry.student : { ...entry.student, first_name: 'Replacement', last_name: 'Account', member_no: 'NEW-ACCOUNT' },
        emergencyContacts: missing ? [] : [
          { id: uuid(400), student_id: id, name: 'Primary Guardian', relationship: 'Parent', phone: '+65 8888 0001', is_primary: true },
          { id: uuid(401), student_id: id, name: 'Secondary Guardian', relationship: 'Guardian', phone: '+65 8888 0002', is_primary: false },
        ], medicalAlerts: missing ? [] : [{ id: uuid(402), student_id: id, description: 'Stored medical alert: carries an inhaler.', active: true, recorded_at: metadata.created_at }] }
    },
    async getStudentHistory(id, options = {}) {
      await delayOrFail('history', id)
      let items = history(id).filter(item => (!options.attendance || (item.record.attendance_status ?? 'unmarked') === options.attendance)
        && (!options.reportsOnly || item.record.report?.trim()))
      if (options.oldestFirst) items = items.toReversed()
      const offset = options.offset ?? 0
      const limit = options.limit ?? 50
      return { items: items.slice(offset, offset + limit), total: items.length, offset, limit }
    },
    async getStudentSummary(id) {
      await delayOrFail('summary', id)
      const items = history(id)
      const count = items.length / 5
      return { pastSessions: items.length, present: count, late: count, absent: count, excused: count, unmarked: count,
        periodStart: items.at(-1)?.event.starts_at ?? null, periodEnd: items[0]?.event.starts_at ?? null,
        cycleStart: '2026-01-01', cycleAttended: count * 2, consecutiveAbsences: 0,
        lastAttended: items.length ? { event: items[0].event, centre: items[0].centre } : null }
    },
  }
}
