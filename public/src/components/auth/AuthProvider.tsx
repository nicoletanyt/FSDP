import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthContext } from '@/lib/auth-context'
import { isUserRole } from '@/lib/auth'
import type { UserProfile } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

interface ProfileState {
  userId: string | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
}

const emptyProfile: ProfileState = {
  userId: null, profile: null, loading: false, error: null,
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [profileState, setProfileState] = useState<ProfileState>(emptyProfile)
  const [revision, setRevision] = useState(0)
  const userId = session?.user.id

  useEffect(() => {
    let active = true
    let receivedEvent = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      // Keep this callback synchronous; profile queries run in the effect below.
      receivedEvent = true
      if (active) {
        setSession(next)
        setInitialized(true)
        if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          setRevision((value) => value + 1)
        }
      }
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (active && !receivedEvent) {
        setSession(error ? null : data.session)
        setInitialized(true)
      }
    }).catch(() => {
      if (active && !receivedEvent) setInitialized(true)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      setProfileState(emptyProfile)
      return
    }

    const profileUserId = userId
    let active = true
    setProfileState({ userId: profileUserId, profile: null, loading: true, error: null })

    async function loadProfile() {
      try {
        const { data, error } = await supabase.from('users')
          .select('id, first_name, last_name, email, role, created_at')
          .eq('id', profileUserId).single<UserProfile>()
        if (error || !data || data.id !== profileUserId || !isUserRole(data.role)) {
          throw new Error('Account profile is unavailable.')
        }
        if (active) {
          setProfileState({ userId: profileUserId, profile: data, loading: false, error: null })
        }
      } catch {
        if (active) {
          setProfileState({
            userId: profileUserId, profile: null, loading: false,
            error: 'We could not load your account profile. Try again or contact an administrator.',
          })
        }
      }
    }

    void loadProfile()
    return () => { active = false }
  }, [userId, revision])

  const reloadProfile = useCallback(() => setRevision((value) => value + 1), [])
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw new Error('Unable to sign out. Please try again.')
    setSession(null)
    setProfileState(emptyProfile)
  }, [])

  // Never expose a previous account's profile during a session change.
  const currentProfile = userId && profileState.userId === userId ? profileState : emptyProfile
  const loading = !initialized || Boolean(
    userId && (profileState.userId !== userId || profileState.loading),
  )

  return (
    <AuthContext.Provider value={{
      session, profile: currentProfile.profile, loading, error: currentProfile.error,
      reloadProfile, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
