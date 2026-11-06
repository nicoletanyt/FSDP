import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { queryGeneration } from '../query-generation'
import { instructorQueryKeys as keys } from './query-keys'

type Change = 'attendance' | 'report' | 'assessment'

function sessionChangeKeys(userId: string, eventId: string, studentIds: readonly string[], kind: Change) {
  const roster = keys.roster(userId, eventId)
  const affected: QueryKey[] = [
    keys.studentContext(userId, eventId), kind === 'report' ? keys.reportsAll(userId) : keys.reports(userId, eventId),
    ...studentIds.map(studentId => keys.student(userId, studentId)),
  ]
  if (kind !== 'attendance') {
    for (const studentId of studentIds) {
      affected.push(keys.report(userId, eventId, studentId), keys.assessment(userId, eventId, studentId))
    }
  }
  return { roster, affected }
}

// Invalidate synchronously even if the editing component has unmounted. Never
// repopulate or invalidate a later login, including a later login by the same user.
export function invalidateSessionChange(client: QueryClient, generation: number, userId: string,
  eventId: string, studentIds: readonly string[], kind: Change, reloadRoster: boolean) {
  if (queryGeneration(client) !== generation) return
  const { roster, affected } = sessionChangeKeys(userId, eventId, studentIds, kind)
  for (const key of [roster, ...affected]) {
    void client.cancelQueries({ queryKey: key })
    void client.invalidateQueries({ queryKey: key, refetchType: key === roster && reloadRoster ? 'none' : 'active' })
  }
}

export async function refreshInvalidatedSessionViews(client: QueryClient, generation: number, userId: string,
  eventId: string, studentIds: readonly string[], kind: Change) {
  if (queryGeneration(client) !== generation) return
  const { roster, affected } = sessionChangeKeys(userId, eventId, studentIds, kind)
  await Promise.all([roster, ...affected].map(queryKey => client.refetchQueries({
    queryKey, type: 'active', predicate: query => query.state.isInvalidated,
  }, { cancelRefetch: false, throwOnError: true })))
}

export function invalidateAvailability(client: QueryClient, generation: number, userId: string) {
  if (queryGeneration(client) !== generation) return
  for (const key of [[...keys.all(userId), 'calendar'], [...keys.all(userId), 'availability']]) {
    void client.cancelQueries({ queryKey: key })
    void client.invalidateQueries({ queryKey: key, refetchType: 'active' })
  }
}
