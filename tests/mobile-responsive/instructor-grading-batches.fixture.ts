// Test-only batch persistence. No production storage or Supabase writes.
import type { InstructorApi } from '../../src/lib/instructor/calendar-queries'
import type { GradingBatch, GradingBatchSaveInput, InstructorId } from '../../src/lib/instructor/types'
import { InstructorDataError } from '../../src/lib/instructor/errors'

declare global { interface Window { gradingBatchRequestsFixture: GradingBatchSaveInput[] } }
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export function createGradingBatchFixture(account: string, mode: string | null, getApi: () => InstructorApi): Pick<InstructorApi, 'getGradingBatch' | 'getLatestGradingBatch' | 'saveGradingBatch' | 'getGradingDay'> {
  const key = `test-only-grading-batches:${account}`
  const batches = new Map<string, GradingBatch>(mode === 'batch-persistence' ? JSON.parse(sessionStorage.getItem(key) ?? '[]') : [])
  const receipts = new Map<string, { input: string; result: GradingBatch }>()
  let failed = false
  const instructorId = uuid(account === 'audit' ? 1 : 2) as InstructorId
  window.gradingBatchRequestsFixture = []
  return {
    // Fixture gradings have no applications: every rostered student is a
    // candidate for every grade, matching how fixture saves snapshot the roster.
    async getGradingDay(eventId, signal) {
      const api = getApi()
      const controller = signal ?? new AbortController().signal
      const roster = await api.getAttendanceRoster(eventId as Parameters<InstructorApi['getAttendanceRoster']>[0], controller)
      const reference = await api.getReferenceData(controller)
      const event = roster.session.event
      const candidates = roster.entries.map(({ record, student }) => ({ studentId: student.student.id,
        name: [student.student.first_name, student.student.last_name].filter(Boolean).join(' ') || student.student.email,
        memberNo: null, candidateNumber: record.candidate_number ?? null, currentGrade: null }))
      return { eventId: event.id, name: event.name, status: event.status, track: roster.session.grading?.track ?? null,
        gradingDate: (event.starts_at ?? '2026-01-01').slice(0, 10),
        startsAt: event.starts_at, endsAt: event.ends_at, reportingTime: null, isChief: true,
        centre: { name: roster.session.centre?.name ?? 'Centre', address: '' },
        panel: [{ instructorId, name: 'Fixture examiner', isChief: true }],
        grades: reference.grades.map(grade => ({ grade, candidates, myBatch: null })) }
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
      return structuredClone(batches.get(JSON.stringify([group.eventId, group.track, group.gradeId])) ?? null)
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
      const batchKey = JSON.stringify([input.eventId, input.track, input.gradeId]), existing = batches.get(batchKey)
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
        track: input.track, target_grade_id: input.gradeId, version: input.expectedVersion + 1,
        status: input.submit ? 'submitted' : 'draft', signature: input.signature, submitted_at: input.submit ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
        students: (existing?.students ?? roster.entries.map(({ student, record }, index) => ({ student_id: student.student.id,
          name: [student.student.first_name, student.student.last_name].join(' '), candidate_number: record.candidate_number ?? index + 1, notes: null })))
          .map(student => ({ ...student, notes: input.comments.find(comment => comment.student_id === student.student_id)?.notes ?? null })),
        items: existing?.items ?? reference.syllabusItems.filter(i => i.track === input.track && i.grade_id === input.gradeId).map(i => ({
          syllabus_item_id: i.id, category: i.category, label: i.label, sort_order: i.sort_order,
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
