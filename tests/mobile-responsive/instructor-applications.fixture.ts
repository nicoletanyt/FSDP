// Test-only grading applications. fixtureData=student-applications gives the
// student one upcoming application (with a session) and one past withdrawn one.
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { StudentApplication } from '../../src/lib/instructor/types'

const grade = { id: 'stored-target-grade', label: 'Stored next grade', colour: 'Blue', is_ranked: true, sort_order: 100 }

export function createApplicationFixture(mode: string | null): Pick<InstructorApi, 'getStudentApplications'> {
  return {
    async getStudentApplications(_studentId, signal) {
      await new Promise(resolve => setTimeout(resolve, 30))
      signal?.throwIfAborted()
      if (mode !== 'student-applications') return []
      const applications: StudentApplication[] = [
        { id: 'application-past', status: 'withdrawn', submittedAt: '2026-05-01T02:00:00Z', targetGrade: grade,
          eventId: '00000000-0000-4000-8000-000000009001', eventName: 'May grading', eventStatus: 'completed',
          gradingDate: '2026-06-01', track: 'children', centreName: 'Central Dojo', session: null },
        { id: 'application-upcoming', status: 'submitted', submittedAt: '2026-11-10T02:00:00Z', targetGrade: grade,
          eventId: '00000000-0000-4000-8000-000000009002', eventName: 'December grading', eventStatus: 'scheduled',
          gradingDate: '2026-12-05', track: 'children', centreName: 'Central Dojo',
          session: { position: 2, startsAt: '2026-12-05T02:00:00Z', endsAt: '2026-12-05T02:30:00Z' } },
      ]
      return applications
    },
  }
}
