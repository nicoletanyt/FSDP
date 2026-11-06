import type { QueryClient } from '@tanstack/react-query'
import type { DirectorySnapshot } from './directory'
import { instructorQueryKeys, instructorQueryTimes } from './query-keys'

export function cachedStudentPreview(client: QueryClient, userId: string | undefined, studentId: string | undefined) {
  if (!userId || !studentId) return null
  const source = client.getQueryState<DirectorySnapshot>(instructorQueryKeys.directory(userId))
  if (!source || source.status !== 'success' || source.isInvalidated
      || Date.now() - source.dataUpdatedAt >= instructorQueryTimes.student.staleTime) return null
  return source.data?.items.find(entry => entry.student.id === studentId.toLowerCase()) ?? null
}
