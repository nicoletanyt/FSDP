import type { QueryClient } from '@tanstack/react-query'

const generations = new WeakMap<QueryClient, number>()

export function queryGeneration(client: QueryClient) {
  return generations.get(client) ?? 0
}

export function advanceQueryGeneration(client: QueryClient) {
  generations.set(client, queryGeneration(client) + 1)
}
