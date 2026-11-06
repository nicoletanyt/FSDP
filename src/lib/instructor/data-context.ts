import { createContext, useContext } from 'react'
import type { InstructorApi } from './calendar-queries'

export const InstructorApiContext = createContext<InstructorApi | null>(null)

export function useInstructorApi() {
  const api = useContext(InstructorApiContext)
  if (!api) throw new Error('Instructor data must be used within the instructor layout.')
  return api
}
