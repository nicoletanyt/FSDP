import { useCallback, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './use-auth'
import { hasSessionEdit, subscribeSessionEdits } from '@/lib/instructor/edit-protection'

export function useInstructorEditProtection(eventId?: string, studentId?: string) {
  const client = useQueryClient()
  const { session, profile } = useAuth()
  const userId = profile?.role === 'instructor' ? session?.user.id : undefined
  const subscribe = useCallback((notify: () => void) => subscribeSessionEdits(client, notify), [client])
  const snapshot = useCallback(() => hasSessionEdit(client, userId, eventId, studentId), [client, userId, eventId, studentId])
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
