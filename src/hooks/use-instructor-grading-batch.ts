import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { useInstructorQuery } from './use-instructor-data'
import { instructorQueryKeys as keys } from '@/lib/instructor/query-keys'
import { toInstructorDataError } from '@/lib/instructor/errors'
import type { CalendarEntry, GradeTrack, GradingBatch, GradingBatchSaveInput, GradingSignature, InstructorIdentity, RosterEntry, SyllabusItemRow } from '@/lib/instructor/types'

export const gradingCellKey = (student: string, item: string) => JSON.stringify([student, item])
const uncheckedCells = (batch: GradingBatch | null) => new Set(batch?.results.filter(cell => !cell.checked).map(cell => gradingCellKey(cell.student_id, cell.syllabus_item_id)) ?? [])

export function useInstructorGradingBatch({ session, entries, identity, track, grade, techniques }: {
  session: CalendarEntry; entries: RosterEntry[]; identity: InstructorIdentity; track: '' | GradeTrack; grade: string; techniques: SyllabusItemRow[]
}) {
  const api = useInstructorApi()
  const client = useQueryClient()
  const key = JSON.stringify([identity.userId, session.event.id, track, grade])
  const queryKey = keys.gradingBatch(identity.userId, session.event.id, track, grade)
  const load = useCallback((signal: AbortSignal) => api.getGradingBatch({ eventId: session.event.id, track: track as GradeTrack, gradeId: grade }, signal), [api, session.event.id, track, grade])
  const query = useInstructorQuery(() => queryKey, load, { enabled: Boolean(track && grade), staleTime: Infinity, gcTime: 10 * 60_000 })
  const [draft, setDraft] = useState<{ key: string; saved: GradingBatch | null; unchecked: Set<string>; dirty: boolean }>({ key: '', saved: null, unchecked: new Set(), dirty: false })
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
      setDraft({ key, saved: query.data, unchecked: uncheckedCells(query.data), dirty: false })
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
  const students = saved?.students ?? entries.map(({ record, student }, index) => ({
    student_id: student.student.id, candidate_number: record.candidate_number ?? index + 1,
    name: [student.student.first_name, student.student.last_name].filter(Boolean).join(' ') || student.student.email, notes: null,
  })).sort((a, b) => a.candidate_number - b.candidate_number)
  const items = saved?.items ?? techniques.map(item => ({ syllabus_item_id: item.id, category: item.category, label: item.label, sort_order: item.sort_order }))
  const ready = query.status === 'success' && draft.key === key
  const readOnly = session.event.status === 'cancelled'
  const locked = readOnly || pending || retryMode !== null || needsReload || !ready

  async function save(submit: boolean, signature: GradingSignature | null = null) {
    if (inFlight.current || !ready || readOnly || needsReload || !track || !grade || !students.length || !items.length) return false
    if (!intent.current) {
      if (submit && !signature) return false
      intent.current = {
        requestId: crypto.randomUUID(), expectedUserId: identity.userId, eventId: session.event.id,
        track, gradeId: grade, expectedVersion: saved?.version ?? 0, submit, signature,
        cells: students.flatMap(student => items.map(item => ({ student_id: student.student_id, syllabus_item_id: item.syllabus_item_id,
          checked: !draft.unchecked.has(gradingCellKey(student.student_id, item.syllabus_item_id)) }))),
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
      setDraft({ key, saved: result, unchecked: uncheckedCells(result), dirty: false })
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
    dirty: draft.dirty, save,
    checked: (student: string, item: string) => !draft.unchecked.has(gradingCellKey(student, item)),
    change(student: string, item: string, checked: boolean) {
      if (locked) return
      setDraft(current => {
        const next = new Set(current.unchecked), cell = gradingCellKey(student, item)
        if (checked) next.delete(cell); else next.add(cell)
        return { ...current, unchecked: next, dirty: true }
      })
      setNotice('')
    },
  }
}
