import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { instructorQueryKeys } from './query-keys'

type HistoryFilters = { attendance: string; sort: string; page: number; pageSize: number }
type PreviousQuery = { queryKey: QueryKey; state: { data: unknown; isInvalidated: boolean; status: string } }

// Only reuse a still-live, successful page from the same account and filter
// context. A removed query may remain referenced by an observer after logout.
export function previousHistoryPage<T extends { offset: number; limit: number }>(client: QueryClient, userId: string | undefined, studentId: string,
  filters: HistoryFilters, previous: T | undefined, query: PreviousQuery | undefined): T | undefined {
  if (!userId || previous === undefined || !query || query.state.status !== 'success'
      || query.state.isInvalidated || query.state.data !== previous
      || client.getQueryCache().find({ queryKey: query.queryKey, exact: true }) !== query) return undefined
  const prefix = instructorQueryKeys.student(userId, studentId)
  const key = query.queryKey
  if (key.length !== prefix.length + 2 || !prefix.every((value, index) => key[index] === value)
      || key[prefix.length] !== 'history') return undefined
  const old = key[prefix.length + 1]
  if (!old || typeof old !== 'object' || Array.isArray(old)) return undefined
  const oldFilters = old as Record<string, unknown>
  if (oldFilters.attendance !== filters.attendance || oldFilters.sort !== filters.sort
      || oldFilters.pageSize !== filters.pageSize || !Number.isSafeInteger(oldFilters.page)
      || Number(oldFilters.page) < 0 || oldFilters.page === filters.page
      || previous.offset !== Number(oldFilters.page) * filters.pageSize || previous.limit !== filters.pageSize) return undefined
  return previous
}
