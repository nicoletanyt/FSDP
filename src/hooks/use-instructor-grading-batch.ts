import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { useInstructorQuery } from './use-instructor-data'
import { instructorQueryKeys as keys } from '@/lib/instructor/query-keys'
import { toInstructorDataError } from '@/lib/instructor/errors'
import type { CalendarEntry, GradingBatch, GradingBatchSaveInput, GradingMark, GradingSignature, InstructorIdentity, RosterEntry, SyllabusItemRow } from '@/lib/instructor/types'

export const gradingCellKey = (student: string, item: string) => JSON.stringify([student, item])
// Saved letters by cell; a cell missing from the map is blank.
const savedMarks = (batch: GradingBatch | null): Record<string, GradingMark> => Object.fromEntries(batch?.results
  .filter(cell => cell.grade !== null).map(cell => [gradingCellKey(cell.student_id, cell.syllabus_item_id), cell.grade!]) ?? [])

// One examiner's checklist for one grading session. A session can hold several
// target grades; each candidate is graded on their own grade's techniques.
export function useInstructorGradingBatch({ session, entries, identity, sessionId, candidateGrades, techniques }: {
  session: CalendarEntry; entries: RosterEntry[]; identity: InstructorIdentity; sessionId: string
  candidateGrades: Map<string, string>; techniques: SyllabusItemRow[]
}) {
  const api = useInstructorApi()
  const client = useQueryClient()
  const key = JSON.stringify([identity.userId, session.event.id, sessionId])
  const queryKey = keys.gradingBatch(identity.userId, session.event.id, sessionId)
  const load = useCallback((signal: AbortSignal) => api.getGradingBatch({ eventId: session.event.id, sessionId }, signal), [api, session.event.id, sessionId])
  const query = useInstructorQuery(() => queryKey, load, { enabled: Boolean(sessionId), staleTime: Infinity, gcTime: 10 * 60_000 })
  const [draft, setDraft] = useState<{ key: string; saved: GradingBatch | null; marks: Record<string, GradingMark>; comments: Record<string, string>; dirty: boolean }>({ key: '', saved: null, marks: {}, comments: {}, dirty: false })
  const [pending, setPending] = useState(false)
  const [retryMode, setRetryMode] = useState<'draft' | 'submit' | null>(null)
  const [needsReload, setNeedsReload] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const intent = useRef<GradingBatchSaveInput | null>(null)
  const currentKey = useRef(key)
  currentKey.current = key
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (query.status === 'success' && draft.key !== key) {
      setDraft({ key, saved: query.data, marks: savedMarks(query.data), comments: Object.fromEntries(query.data?.students.map(student => [student.student_id, student.notes ?? '']) ?? []), dirty: false })
      intent.current = null; setRetryMode(null); setNeedsReload(false); setError(''); setNotice('')
    }
  }, [query.status, query.data, key, draft.key])
  useEffect(() => {
    if (!draft.dirty && !pending && !retryMode) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draft.dirty, pending, retryMode])

  const saved = draft.key === key ? draft.saved : null
  const students = saved?.students ?? entries.filter(({ student }) => candidateGrades.has(student.student.id)).map(({ record, student }, index) => ({
    student_id: student.student.id, candidate_number: record.candidate_number ?? index + 1,
    name: [student.student.first_name, student.student.last_name].filter(Boolean).join(' ') || student.student.email, notes: null,
    target_grade_id: candidateGrades.get(student.student.id)!,
  })).sort((a, b) => a.candidate_number - b.candidate_number)
  const items = saved?.items ?? techniques.map(item => ({ syllabus_item_id: item.id, category: item.category, label: item.label, sort_order: item.sort_order, grade_id: item.grade_id }))
  const ready = query.status === 'success' && draft.key === key
  const readOnly = session.event.status === 'cancelled'
  const locked = readOnly || pending || retryMode !== null || needsReload || !ready
  // Absent candidates can't be marked, so only present (or unmarked-attendance) candidates count.
  const absent = new Set(entries.filter(entry => entry.record.attendance_status === 'absent').map(entry => entry.record.student_id))
  const cells = students.filter(student => !absent.has(student.student_id)).flatMap(student => items.filter(item => item.grade_id === student.target_grade_id)
    .map(item => gradingCellKey(student.student_id, item.syllabus_item_id)))
  // Drafts may have blanks; submitting needs every technique marked for every present candidate.
  const unmarked = cells.filter(cell => !draft.marks[cell]).length

  async function save(submit: boolean, signature: GradingSignature | null = null) {
    if (inFlight.current || !ready || readOnly || needsReload || !sessionId || !students.length || !items.length) return false
    if (!intent.current) {
      if (submit && (!signature || unmarked)) return false
      intent.current = {
        requestId: crypto.randomUUID(), expectedUserId: identity.userId, eventId: session.event.id,
        sessionId, expectedVersion: saved?.version ?? 0, submit, signature,
        cells: students.flatMap(student => items.filter(item => item.grade_id === student.target_grade_id).map(item => ({
          student_id: student.student_id, syllabus_item_id: item.syllabus_item_id,
          grade: draft.marks[gradingCellKey(student.student_id, item.syllabus_item_id)] ?? null }))),
        comments: students.map(student => ({ student_id: student.student_id, notes: draft.comments[student.student_id] || null })),
      }
    }
    const request = intent.current
    const operationKey = key
    inFlight.current = true; setPending(true); setError(''); setNotice('')
    try {
      const result = await api.saveGradingBatch(request)
      if (!mounted.current || currentKey.current !== operationKey) return false
      client.setQueryData(queryKey, result)
      client.setQueryData(keys.gradingSession(identity.userId, session.event.id), (current: Record<string, unknown> | undefined) => current ? { ...current, initialBatch: result } : undefined)
      setDraft({ key, saved: result, marks: savedMarks(result), comments: Object.fromEntries(result.students.map(student => [student.student_id, student.notes ?? ''])), dirty: false })
      intent.current = null; setRetryMode(null)
      setNotice(result.status === 'submitted' ? 'Your grading batch has been submitted. No final grades have been assigned.' : 'Your draft has been saved.')
      return true
    } catch (failure) {
      if (!mounted.current || currentKey.current !== operationKey) return false
      const problem = toInstructorDataError(failure, 'Unable to save your grading batch. Please retry.')
      setError(problem.message)
      if (['request_failed', 'invalid_data', 'cancelled'].includes(problem.code)) {
        setRetryMode(request.submit ? 'submit' : 'draft')
      } else {
        intent.current = null; setRetryMode(null)
        setNeedsReload(problem.code === 'conflict' || problem.code === 'forbidden')
      }
      return false
    } finally {
      inFlight.current = false
      if (mounted.current && currentKey.current === operationKey) setPending(false)
    }
  }

  return {
    query, ready, saved, students, items, pending, error, notice, retryMode, needsReload, readOnly, locked,
    groupLocked: pending || draft.dirty || retryMode !== null || needsReload,
    dirty: draft.dirty, save, unmarked, complete: cells.length > 0 && unmarked === 0,
    mark: (student: string, item: string): GradingMark | null => draft.marks[gradingCellKey(student, item)] ?? null,
    comment: (student: string) => draft.comments[student] ?? '',
    changeComment(student: string, value: string) {
      if (locked) return
      setDraft(current => ({ ...current, comments: { ...current.comments, [student]: value }, dirty: true }))
      setNotice('')
    },
    // null clears the cell back to blank.
    change(student: string, item: string, grade: GradingMark | null) {
      if (locked) return
      setDraft(current => {
        const next = { ...current.marks }, cell = gradingCellKey(student, item)
        if (grade) next[cell] = grade; else delete next[cell]
        return { ...current, marks: next, dirty: true }
      })
      setNotice('')
    },
  }
}
