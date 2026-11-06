import type { QueryClient } from '@tanstack/react-query'
import { queryGeneration } from '../query-generation'

type Scope = { userId: string; eventId: string; studentId: string; generation: number }
type Store = { writes: Map<symbol, Scope>; listeners: Set<() => void> }
const stores = new WeakMap<QueryClient, Store>()

function storeFor(client: QueryClient): Store {
  let store = stores.get(client)
  if (!store) { store = { writes: new Map(), listeners: new Set() }; stores.set(client, store) }
  return store
}

export function protectSessionEdit(client: QueryClient, scope: Scope) {
  const store = storeFor(client)
  const token = Symbol('session-edit')
  store.writes.set(token, scope)
  store.listeners.forEach(listener => listener())
  return () => {
    if (store.writes.delete(token)) store.listeners.forEach(listener => listener())
  }
}

export function subscribeSessionEdits(client: QueryClient, listener: () => void) {
  const store = storeFor(client)
  store.listeners.add(listener)
  return () => { store.listeners.delete(listener) }
}

export function hasSessionEdit(client: QueryClient, userId: string | undefined, eventId?: string, studentId?: string) {
  if (!userId || (!eventId && !studentId)) return false
  return [...storeFor(client).writes.values()].some(scope => scope.userId === userId && scope.generation === queryGeneration(client)
    && (!eventId || scope.eventId === eventId) && (!studentId || scope.studentId === studentId))
}
