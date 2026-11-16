import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { toInstructorDataError } from '@/lib/instructor/errors'
import type { StudentGradingReads } from '@/lib/instructor/grading'
import { instructorQueryKeys as keys } from '@/lib/instructor/query-keys'
import type { StudentId, TechniqueProgressEntry, TechniqueStatus } from '@/lib/instructor/types'

export type ProgressSaveState = { status: 'saving' } | { status: 'saved' } | { status: 'error'; message: string }

// Auto-saves progress checklist changes. Both the student page and the class
// sheet read the same student grading query, so an update here shows in both.
// Saves for one technique run in order, so a slower earlier save cannot
// overwrite a later choice.
export function useTechniqueProgress(studentId: StudentId) {
  const api = useInstructorApi()
  const client = useQueryClient()
  const { session } = useAuth()
  const key = keys.studentGrading(session?.user.id ?? '', studentId)
  const queues = useRef(new Map<string, Promise<unknown>>())
  const [states, setStates] = useState<Record<string, ProgressSaveState>>({})

  const replace = useCallback((itemId: string, entry: TechniqueProgressEntry | null) => {
    client.setQueryData<StudentGradingReads>(key, reads => reads && {
      ...reads,
      progress: [...reads.progress.filter(item => item.progress.syllabus_item_id !== itemId), ...(entry ? [entry] : [])],
    })
  }, [client, key])

  const update = useCallback((itemId: string, status: TechniqueStatus, note: string | null) => {
    const reads = client.getQueryData<StudentGradingReads>(key)
    const previous = reads?.progress.find(item => item.progress.syllabus_item_id === itemId) ?? null
    const cleanNote = note?.trim() || null
    if ((previous?.progress.status ?? 'not_assessed') === status && (previous?.progress.note ?? null) === cleanNote) return
    replace(itemId, status === 'not_assessed' && !cleanNote ? null : {
      progress: {
        id: previous?.progress.id ?? '', student_id: studentId, syllabus_item_id: itemId,
        status: status === 'not_assessed' ? null : status, note: cleanNote,
        updated_at: new Date().toISOString(), updated_by: previous?.progress.updated_by ?? null,
      },
      instructor: previous?.instructor ?? null,
    })
    setStates(current => ({ ...current, [itemId]: { status: 'saving' } }))
    const run = (queues.current.get(itemId) ?? Promise.resolve()).then(async () => {
      try {
        const saved = await api.setTechniqueProgress(studentId, itemId, status, cleanNote)
        if (queues.current.get(itemId) === run) {
          replace(itemId, saved)
          setStates(current => ({ ...current, [itemId]: { status: 'saved' } }))
        }
      } catch (failure) {
        replace(itemId, previous)
        setStates(current => ({ ...current, [itemId]: {
          status: 'error', message: toInstructorDataError(failure, 'Unable to save technique progress. Please try again.').message,
        } }))
      }
    })
    queues.current.set(itemId, run)
  }, [api, client, key, replace, studentId])

  return { update, states }
}
