// Test-only batch persistence. No production storage or Supabase writes.
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { GradingBatch, GradingBatchSaveInput, InstructorId } from '../../src/lib/instructor/types'
import { InstructorDataError } from '../../src/lib/instructor/errors'

declare global { interface Window { gradingBatchRequestsFixture: GradingBatchSaveInput[] } }
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
// The one sorted session every fixture grading has, for the stored target grade.
export const fixtureSessionId = uuid(901)
const fixtureGradeId = 'stored-target-grade'
export const fixtureSecondSessionId = uuid(902)

// fixtureData=grading-sessions: each grading is sorted into two timed sessions,
// first half of the roster then the second half. Calendar and grading day agree.
export function fixtureGradingSessions(startsAt: string, endsAt: string, studentIds: string[]) {
  const start = new Date(startsAt).getTime()
  const middle = new Date(start + (new Date(endsAt).getTime() - start) / 2).toISOString()
  const split = Math.ceil(studentIds.length / 2)
  return [
    { id: fixtureSessionId, position: 1, startsAt: new Date(start).toISOString(), endsAt: middle, studentIds: studentIds.slice(0, split) },
    { id: fixtureSecondSessionId, position: 2, startsAt: middle, endsAt: new Date(endsAt).toISOString(), studentIds: studentIds.slice(split) },
  ]
}

export function createGradingBatchFixture(account: string, mode: string | null, getApi: () => InstructorApi): Pick<InstructorApi, 'getGradingBatch' | 'getLatestGradingBatch' | 'saveGradingBatch' | 'getGradingDay' | 'getSessionChecklists'> {
  const key = `test-only-grading-batches:${account}`
  const batches = new Map<string, GradingBatch>(mode === 'batch-persistence' ? JSON.parse(sessionStorage.getItem(key) ?? '[]') : [])
  const receipts = new Map<string, { input: string; result: GradingBatch }>()
  let failed = false
  const instructorId = uuid(account === 'audit' ? 1 : 2) as InstructorId
  window.gradingBatchRequestsFixture = []
  return {
    // Fixture gradings have no applications: every rostered student applies for
    // the stored target grade and has already been sorted into one session. They
    // also have no track, so the grading day grades the children's track.
    async getGradingDay(eventId, signal) {
      const api = getApi()
      const controller = signal ?? new AbortController().signal
      const roster = await api.getAttendanceRoster(eventId as Parameters<InstructorApi['getAttendanceRoster']>[0], controller)
      const reference = await api.getReferenceData(controller)
      const event = roster.session.event
      const target = reference.grades.find(grade => grade.id === fixtureGradeId) ?? reference.grades[0]
      const candidates = roster.entries.map(({ record, student }) => ({ applicationId: `application-${student.student.id}`, studentId: student.student.id,
        name: [student.student.first_name, student.student.last_name].filter(Boolean).join(' ') || student.student.email,
        memberNo: null, candidateNumber: record.candidate_number ?? null, currentGrade: null }))
      const timed = mode === 'grading-sessions' && event.starts_at && event.ends_at
        ? fixtureGradingSessions(event.starts_at, event.ends_at, candidates.map(candidate => candidate.studentId)) : null
      const sessionOf = (studentId: string) => timed?.find(item => item.studentIds.includes(studentId))?.id ?? fixtureSessionId
      return { eventId: event.id, name: event.name, status: event.status, track: roster.session.grading?.track ?? 'children',
        gradingDate: (event.starts_at ?? '2026-01-01').slice(0, 10),
        startsAt: event.starts_at, endsAt: event.ends_at, reportingTime: null, isChief: true,
        centre: { name: roster.session.centre?.name ?? 'Centre', address: '' },
        panel: [{ instructorId, name: 'Fixture examiner', isChief: true }],
        applicationOpensOn: null, applicationDeadline: '2026-11-01', gradingStarted: false, publishedAt: '2026-11-01T00:00:00Z', isPrivate: false, capacity: null, warnings: [],
        students: candidates.map(candidate => ({ ...candidate, targetGrade: target, sessionId: sessionOf(candidate.studentId) })),
        sessions: timed ? timed.map(item => ({ id: item.id, position: item.position, startsAt: item.startsAt, endsAt: item.endsAt,
          grades: [{ grade: target, candidates: candidates.filter(candidate => item.studentIds.includes(candidate.studentId)) }], myBatch: null }))
          : [{ id: fixtureSessionId, position: 1, startsAt: null, endsAt: null, grades: [{ grade: target, candidates }], myBatch: null }] }
    },
    // Read-only checklists page: the fixture examiner has no saved checklist to show.
    async getSessionChecklists() {
      await new Promise(resolve => setTimeout(resolve, 30))
      return { viewerId: instructorId as string, batches: [] }
    },
    async getLatestGradingBatch(eventId, signal) {
      await new Promise(resolve => setTimeout(resolve, 30))
      signal?.throwIfAborted()
      return structuredClone([...batches.values()].filter(batch => batch.event_id === eventId)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id))[0] ?? null)
    },
    async getGradingBatch(group, signal) {
      await new Promise(resolve => setTimeout(resolve, mode === 'batch-loading' ? 1500 : 30))
      signal?.throwIfAborted()
      return structuredClone(batches.get(JSON.stringify([group.eventId, group.sessionId])) ?? null)
    },
    async saveGradingBatch(input) {
      window.gradingBatchRequestsFixture.push(structuredClone(input))
      await new Promise(resolve => setTimeout(resolve, mode === 'batch-slow' ? 1500 : 150))
      if (input.expectedUserId !== uuid(account === 'audit' ? 90001 : 90002)) throw new InstructorDataError('forbidden', 'Account changed.')
      const receipt = receipts.get(input.requestId)
      if (receipt) {
        if (receipt.input !== JSON.stringify(input)) throw new InstructorDataError('conflict', 'Request changed.')
        return structuredClone(receipt.result)
      }
      const batchKey = JSON.stringify([input.eventId, input.sessionId]), existing = batches.get(batchKey)
      if (mode === 'batch-error' && !failed) { failed = true; throw new InstructorDataError('request_failed', 'Grading could not be saved. Please retry.') }
      if (mode === 'batch-conflict' && !failed && existing) {
        failed = true; batches.set(batchKey, { ...existing, version: existing.version + 1 })
        throw new InstructorDataError('conflict', 'Your grading draft changed in another tab. Refresh the page before continuing.')
      }
      if ((existing?.version ?? 0) !== input.expectedVersion) throw new InstructorDataError('conflict', 'Grading draft changed.')
      const roster = await getApi().getAttendanceRoster(input.eventId, new AbortController().signal)
      const reference = await getApi().getReferenceData()
      const batch: GradingBatch = {
        id: existing?.id ?? crypto.randomUUID(), event_id: input.eventId, instructor_id: instructorId,
        track: 'children', session_id: input.sessionId, version: input.expectedVersion + 1,
        status: input.submit ? 'submitted' : 'draft', signature: input.signature, submitted_at: input.submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        students: (existing?.students ?? roster.entries.map(({ student, record }, index) => ({ student_id: student.student.id,
          name: [student.student.first_name, student.student.last_name].join(' '), candidate_number: record.candidate_number ?? index + 1, notes: null,
          target_grade_id: fixtureGradeId })))
          .map(student => ({ ...student, notes: input.comments.find(comment => comment.student_id === student.student_id)?.notes ?? null })),
        items: existing?.items ?? reference.syllabusItems.filter(i => i.track === 'children' && i.grade_id === fixtureGradeId).map(i => ({
          syllabus_item_id: i.id, category: i.category, label: i.label, sort_order: i.sort_order, grade_id: i.grade_id,
        })),
        results: structuredClone(input.cells),
      }
      batches.set(batchKey, batch); receipts.set(input.requestId, { input: JSON.stringify(input), result: batch })
      if (mode === 'batch-persistence') sessionStorage.setItem(key, JSON.stringify([...batches]))
      if (mode === 'batch-lost-response' && !failed) { failed = true; throw new InstructorDataError('request_failed', 'The save response was lost. Please retry.') }
      return structuredClone(batch)
    },
  }
}
