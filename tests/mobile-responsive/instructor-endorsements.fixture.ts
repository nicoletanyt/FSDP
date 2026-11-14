// Test-only endorsements. No production storage or Supabase writes.
// fixtureData=endorse-eligible: every student meets every requirement (Endorse shows).
// fixtureData=grading-endorsed: the first candidate of each grading is endorsed.
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { GradingEndorsement, GradingEndorsementStatus } from '../../src/lib/instructor/types'

declare global { interface Window { endorseRequestsFixture: { studentId: string; targetGradeId: string }[] } }
const targetGradeId = 'stored-target-grade'

export function createEndorsementFixture(mode: string | null, getApi: () => InstructorApi): Pick<InstructorApi, 'getEndorsementStatus' | 'endorseStudent' | 'getEventEndorsements'> {
  const endorsed = new Map<string, GradingEndorsement>()
  window.endorseRequestsFixture = []
  const status = (studentId: string): GradingEndorsementStatus => ({
    targetGradeId, eligible: mode === 'endorse-eligible', endorsement: endorsed.get(studentId) ?? null,
  })
  return {
    async getEndorsementStatus(studentId, signal) {
      await new Promise(resolve => setTimeout(resolve, 30))
      signal?.throwIfAborted()
      return status(studentId)
    },
    async endorseStudent(studentId, grade) {
      window.endorseRequestsFixture.push({ studentId, targetGradeId: grade })
      await new Promise(resolve => setTimeout(resolve, 100))
      if (!endorsed.has(studentId)) endorsed.set(studentId, { endorsedAt: '2026-11-13T02:00:00Z', endorsedBy: 'Fixture Sensei' })
      return status(studentId)
    },
    async getEventEndorsements(eventId, signal) {
      if (mode !== 'grading-endorsed') return []
      const roster = await getApi().getAttendanceRoster(eventId as Parameters<InstructorApi['getAttendanceRoster']>[0], signal ?? new AbortController().signal)
      const first = roster.entries[0]
      return first ? [{ studentId: first.student.student.id, targetGradeId, endorsedAt: '2026-11-13T02:00:00Z', endorsedBy: 'Fixture Sensei' }] : []
    },
  }
}
