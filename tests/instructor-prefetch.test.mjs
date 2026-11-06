import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const userId = '00000000-0000-4000-8000-000000000001'
const firstId = '00000000-0000-4000-8000-000000000002'
const secondId = '00000000-0000-4000-8000-000000000003'
const thirdId = '00000000-0000-4000-8000-000000000004'
const fixedNow = Date.parse('2026-11-04T02:00:00Z')
let server, createPrefetcher, nextUpcomingClass, loadCalendarEvents, loadCalendarAvailability, usePrefetch, AuthContext, InstructorApiContext, createBoundary, keys

before(async () => {
  server = await createServer({ configFile: false, resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  ;({ createInstructorPrefetcher: createPrefetcher, nextUpcomingClass } = await server.ssrLoadModule('/src/lib/instructor/prefetch.ts'))
  ;({ loadCalendarEvents, loadCalendarAvailability } = await server.ssrLoadModule('/src/lib/instructor/calendar-queries.ts'))
  ;({ useInstructorPrefetch: usePrefetch } = await server.ssrLoadModule('/src/hooks/use-instructor-prefetch.ts'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ InstructorApiContext } = await server.ssrLoadModule('/src/lib/instructor/data-context.ts'))
  ;({ createQueryAuthBoundary: createBoundary } = await server.ssrLoadModule('/src/lib/query-auth-boundary.ts'))
  ;({ instructorQueryKeys: keys } = await server.ssrLoadModule('/src/lib/instructor/query-keys.ts'))
})
after(async () => { await server?.close() })

function connection(value) {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'connection')
  Object.defineProperty(navigator, 'connection', { configurable: true, value })
  return () => previous ? Object.defineProperty(navigator, 'connection', previous) : delete navigator.connection
}

function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const boundary = createBoundary(client)
  boundary.setUser(userId); boundary.setRole(userId, 'instructor')
  const calls = { calendar: [], availability: [], roster: [] }
  const api = {
    getCalendar: async ({ from, to, offset, limit }) => { calls.calendar.push({ from, to }); return { items: [], total: 0, offset, limit } },
    getAvailability: async ({ from, to, offset, limit }) => { calls.availability.push({ from, to }); return { items: [], total: 0, offset, limit } },
    getAttendanceRoster: async id => { calls.roster.push(id); return { session: { event: { id } }, entries: [] } },
  }
  return { client, boundary, calls, api }
}

const event = (id, startsAt, extra = {}) => ({ id, type: 'training', status: 'scheduled', startsAt, ...extra })
const wait = async (ms = 20) => { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) }) }
async function until(check) {
  for (let attempt = 0; attempt < 40; attempt++) { if (check()) return; await wait() }
  assert.fail('Expected prefetch was not observed')
}

test('selects only the next scheduled training class starting today in Singapore', () => {
  const events = [
    event(firstId, '2026-11-04T04:00:00Z'), event(secondId, '2026-11-04T03:00:00Z'),
    event(thirdId, '2026-11-04T02:30:00Z', { status: 'cancelled' }),
    event(thirdId, '2026-11-04T02:20:00Z', { type: 'grading' }),
    event(thirdId, '2026-11-04T01:00:00Z'), event(thirdId, '2026-11-04T16:30:00Z'),
  ]
  assert.equal(nextUpcomingClass(events, '2026-11-04', fixedNow).id, secondId)
  assert.equal(nextUpcomingClass(events, '2026-11-05', fixedNow).startsAt, '2026-11-04T16:30:00Z')
  assert.equal(nextUpcomingClass([], '2026-11-04', fixedNow), null)
})

test('prefetched range and roster share foreground keys and do not repeat fresh service reads', async () => {
  const restore = connection({ saveData: false })
  const { client, calls, api } = fixture()
  const prefetch = createPrefetcher(client, api, userId)
  const range = { from: '2026-11-02', to: '2026-11-09' }
  try {
    await Promise.all([prefetch.range(range), prefetch.range(range), prefetch.roster(firstId), prefetch.roster(firstId)])
    assert.equal(calls.calendar.length, 1)
    assert.equal(calls.availability.length, 1)
    assert.deepEqual(calls.roster, [firstId])
    await client.fetchQuery({ queryKey: keys.calendar(userId, range.from, range.to), staleTime: 120_000,
      queryFn: () => { throw new Error('foreground calendar unexpectedly fetched') } })
    await client.fetchQuery({ queryKey: keys.availability(userId, range.from, range.to), staleTime: 60_000,
      queryFn: () => { throw new Error('foreground availability unexpectedly fetched') } })
    await client.fetchQuery({ queryKey: keys.roster(userId, firstId), staleTime: 30_000,
      queryFn: () => { throw new Error('foreground roster unexpectedly fetched') } })
    assert.equal(calls.calendar.length + calls.availability.length + calls.roster.length, 3)
  } finally { client.clear(); restore() }
})

test('service-call comparison: prefetched navigation and open shift three reads to the background', async () => {
  const restore = connection({ saveData: false })
  const range = { from: '2026-11-02', to: '2026-11-09' }
  const plain = fixture(), warmed = fixture()
  async function foreground(f) {
    await Promise.all([
      f.client.fetchQuery({ queryKey: keys.calendar(userId, range.from, range.to), staleTime: 120_000,
        queryFn: ({ signal }) => loadCalendarEvents(f.api, range, signal) }),
      f.client.fetchQuery({ queryKey: keys.availability(userId, range.from, range.to), staleTime: 60_000,
        queryFn: ({ signal }) => loadCalendarAvailability(f.api, range, signal) }),
      f.client.fetchQuery({ queryKey: keys.roster(userId, firstId), staleTime: 30_000,
        queryFn: ({ signal }) => f.api.getAttendanceRoster(firstId, signal) }),
    ])
  }
  const count = f => f.calls.calendar.length + f.calls.availability.length + f.calls.roster.length
  try {
    await foreground(plain)
    assert.equal(count(plain), 3, 'without prefetch, foreground invokes three service reads')
    const prefetch = createPrefetcher(warmed.client, warmed.api, userId)
    await Promise.all([prefetch.range(range), prefetch.roster(firstId)])
    const beforeOpen = count(warmed)
    await foreground(warmed)
    assert.equal(beforeOpen, 3, 'prefetch performs three service reads in the background')
    assert.equal(count(warmed) - beforeOpen, 0, 'fresh navigation/open performs no additional service reads')
  } finally { plain.client.clear(); warmed.client.clear(); restore() }
})

test('logout cancels an in-flight prefetch and cannot leave its result in the cache', async () => {
  const restore = connection({ saveData: false })
  const { client, boundary, api } = fixture()
  let aborted = false, finish
  const prefetch = createPrefetcher(client, { ...api, getAttendanceRoster: (_id, signal) => new Promise(resolve => {
    finish = resolve
    signal.addEventListener('abort', () => { aborted = true })
  }) }, userId)
  try {
    const pending = prefetch.roster(firstId)
    // The cancelled, detached query may schedule GC after it settles; avoid a
    // long-lived Node test timer without changing the production cache policy.
    const query = client.getQueryCache().find({ queryKey: keys.roster(userId, firstId) })
    query.setOptions({ ...query.options, gcTime: Infinity })
    boundary.setUser(null)
    assert.equal(aborted, true)
    finish({ session: {}, entries: [] })
    await pending
    assert.equal(client.getQueryData(keys.roster(userId, firstId)), undefined)
  } finally { client.clear(); restore() }
})

test('data saver and account changes block dispatch, and failed prefetch does not poison a foreground read', async () => {
  const restore = connection({ saveData: true })
  const { client, boundary, calls, api } = fixture()
  const prefetch = createPrefetcher(client, api, userId)
  const range = { from: '2026-11-02', to: '2026-11-09' }
  try {
    await prefetch.range(range); await prefetch.roster(firstId)
    assert.deepEqual(calls, { calendar: [], availability: [], roster: [] })
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: false } })
    let attempts = 0
    const failing = createPrefetcher(client, { ...api, getAttendanceRoster: async () => { attempts++; throw { status: 403 } } }, userId)
    await failing.roster(firstId)
    assert.equal(attempts, 1)
    await assert.rejects(client.fetchQuery({ queryKey: keys.roster(userId, firstId), retry: false,
      queryFn: async () => { attempts++; throw new Error('foreground error') } }), /foreground error/)
    assert.equal(attempts, 2)
    boundary.setUser(null); boundary.setUser(userId); boundary.setRole(userId, 'instructor')
    await prefetch.range(range); await prefetch.roster(secondId)
    assert.deepEqual(calls, { calendar: [], availability: [], roster: [] })
  } finally { client.clear(); restore() }
})

test('week prefetch uses two viewport-matched adjacent ranges and only the next class roster', async () => {
  const restore = connection({ saveData: false })
  const originalNow = Date.now
  Date.now = () => fixedNow
  const { client, calls, api } = fixture()
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  const events = [event(firstId, '2026-11-04T04:00:00Z'), event(secondId, '2026-11-04T03:00:00Z')]
  let root
  function Component() {
    usePrefetch({ selectedDate: new Date(2026, 10, 4), today: new Date(2026, 10, 4),
      range: { from: '2026-11-02', to: '2026-11-09' }, events, ready: true, weekView: true, isDesktop: true, mobileList: false })
    return null
  }
  const tree = React.createElement(QueryClientProvider, { client }, React.createElement(AuthContext.Provider, { value: auth },
    React.createElement(InstructorApiContext.Provider, { value: api }, React.createElement(Component))))
  try {
    await act(async () => { root = create(tree) })
    await until(() => calls.calendar.length === 2 && calls.availability.length === 2 && calls.roster.length === 1)
    assert.deepEqual(calls.availability, [{ from: '2026-10-26', to: '2026-11-02' }, { from: '2026-11-09', to: '2026-11-16' }])
    assert.deepEqual(calls.roster, [secondId])
    await act(async () => root.update(tree))
    await wait()
    assert.equal(calls.roster.length, 1)
  } finally { if (root) await act(async () => root.unmount()); client.clear(); Date.now = originalNow; restore() }
})

test('mobile adjacent ranges match its two-day viewport; an off-range today does not fetch a roster', async () => {
  const restore = connection({ saveData: false })
  const { client, calls, api } = fixture()
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  let root
  function Component() {
    usePrefetch({ selectedDate: new Date(2026, 10, 4), today: new Date(2026, 10, 20),
      range: { from: '2026-11-04', to: '2026-11-06' }, events: [event(firstId, '2026-11-04T04:00:00Z')],
      ready: true, weekView: true, isDesktop: false, mobileList: false })
    return null
  }
  const tree = React.createElement(QueryClientProvider, { client }, React.createElement(AuthContext.Provider, { value: auth },
    React.createElement(InstructorApiContext.Provider, { value: api }, React.createElement(Component))))
  try {
    await act(async () => { root = create(tree) })
    await until(() => calls.availability.length === 2)
    assert.deepEqual(calls.availability, [{ from: '2026-10-28', to: '2026-10-30' }, { from: '2026-11-11', to: '2026-11-13' }])
    assert.deepEqual(calls.roster, [])
  } finally { if (root) await act(async () => root.unmount()); client.clear(); restore() }
})

test('hover is delayed/cancellable and touch prefetches only its chosen class', async () => {
  const restore = connection({ saveData: false })
  const { client, calls, api } = fixture()
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  let root, controls
  function Component() {
    controls = usePrefetch({ selectedDate: new Date(2026, 10, 4), today: new Date(2026, 10, 4),
      range: { from: '2026-11-02', to: '2026-11-09' }, events: [], ready: true, weekView: false, isDesktop: true, mobileList: false })
    return null
  }
  const tree = React.createElement(QueryClientProvider, { client }, React.createElement(AuthContext.Provider, { value: auth },
    React.createElement(InstructorApiContext.Provider, { value: api }, React.createElement(Component))))
  try {
    await act(async () => { root = create(tree) })
    await act(async () => { controls.hoverClass(firstId); controls.cancelHover() })
    await wait(180)
    assert.deepEqual(calls.roster, [])
    await act(async () => {
      controls.hoverClass(firstId)
      Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } })
    })
    await wait(180)
    assert.deepEqual(calls.roster, [])
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: false } })
    await act(async () => { controls.hoverClass(firstId); controls.hoverClass(secondId) })
    await wait(180)
    assert.deepEqual(calls.roster, [secondId])
    await act(async () => { controls.touchClass(thirdId) })
    await until(() => calls.roster.length === 2)
    assert.deepEqual(calls.roster, [secondId, thirdId])
  } finally { if (root) await act(async () => root.unmount()); client.clear(); restore() }
})
