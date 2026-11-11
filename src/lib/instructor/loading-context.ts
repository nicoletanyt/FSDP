import { createContext } from 'react'

export const InstructorLoadingContext = createContext<((id: string) => () => void) | null>(null)
