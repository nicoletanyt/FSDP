import { useRef, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'

/** Sign-out handler with pending/error state, for the mobile navigation menu. */
export function useSignOut() {
  const { signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  async function handleSignOut() {
    if (inFlight.current) return
    inFlight.current = true
    setSigningOut(true)
    setError('')
    try {
      await signOut()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign out. Try again.')
    } finally {
      inFlight.current = false
      setSigningOut(false)
    }
  }

  return { handleSignOut, signingOut, error }
}
