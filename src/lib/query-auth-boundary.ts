import type { QueryClient } from '@tanstack/react-query'
import type { UserRole } from './auth'
import { advanceQueryGeneration } from './query-generation'

// Called before publishing an auth transition to React. A token refresh for the
// same user does not clear the cache; a confirmed role change does.
export function createQueryAuthBoundary(client: QueryClient) {
  let userId: string | null = null
  let role: UserRole | null = null

  function clear() {
    advanceQueryGeneration(client)
    void client.cancelQueries()
    client.clear()
  }

  return {
    setUser(nextUserId: string | null) {
      if (nextUserId === userId) return
      clear()
      userId = nextUserId
      role = null
    },
    setRole(profileUserId: string, nextRole: UserRole | null) {
      if (profileUserId !== userId) return
      if (role !== null && role !== nextRole) clear()
      role = nextRole
    },
  }
}
