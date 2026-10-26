import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { UserProfile } from './auth'

export interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
  reloadProfile: () => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
