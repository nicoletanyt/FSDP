import { useCallback } from 'react'
import { useInstructorApi } from '@/lib/instructor/data-context'
import { toInstructorDataError } from '@/lib/instructor/errors'
import { useInstructorQuery } from './use-instructor-data'

export function useInstructorWriteIdentity() {
  const api = useInstructorApi()
  const load = useCallback(async (signal: AbortSignal) => {
    try { return await api.getCurrentInstructor(signal) } catch (error) {
      if (toInstructorDataError(error, 'Unable to load editing permissions.').code === 'instructor_not_found') return null
      throw error
    }
  }, [api])
  return useInstructorQuery('instructor-write-identity', load)
}
