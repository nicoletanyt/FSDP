import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { useInstructorQuery } from './use-instructor-data'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { toInstructorDataError } from '@/lib/instructor/errors'
import { instructorQueryKeys as keys, instructorQueryTimes as times } from '@/lib/instructor/query-keys'
import type { GradingEndorsementStatus, StudentId } from '@/lib/instructor/types'

// The student's endorsement status for their next grade, and the endorse action.
// The server re-checks eligibility, so the button can never endorse early.
export function useGradingEndorsement(studentId: StudentId) {
  const api = useInstructorApi()
  const client = useQueryClient()
  const { session } = useAuth()
  const load = useCallback((signal: AbortSignal) => api.getEndorsementStatus(studentId, signal), [api, studentId])
  const status = useInstructorQuery(userId => keys.endorsement(userId, studentId), load, times.studentGrading)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolves true once the endorsement is saved.
  async function endorse() {
    const target = status.data?.targetGradeId
    if (!target || pending) return false
    setPending(true)
    setError(null)
    try {
      const result = await api.endorseStudent(studentId, target)
      client.setQueryData<GradingEndorsementStatus>(keys.endorsement(session?.user.id ?? '', studentId), result)
      return true
    } catch (failure) {
      setError(toInstructorDataError(failure, 'Unable to endorse this student. Please try again.').message)
      status.retry()
      return false
    } finally {
      setPending(false)
    }
  }

  return { status, endorse, pending, error, clearError: () => setError(null) }
}
