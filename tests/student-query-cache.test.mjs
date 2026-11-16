import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
// TanStack disables refetchInterval when it detects a server (no window), so
// define one before it loads to exercise checkout polling.
globalThis.window ??= globalThis
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const userId = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'
const classId = '00000000-0000-4000-8000-000000000003'
let server, stub, useLiveStudentSchedule, useStudentCredits, AuthContext, keys, createBoundary

before(async () => {
  const stubPath = new URL('./helpers/supabase-student-stub.ts', import.meta.url).pathname
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: [
      { find: '@/lib/supabase', replacement: stubPath },
      { find: '@', replacement: new URL('../src', import.meta.url).pathname },
    ] } })
  stub = await server.ssrLoadModule(stubPath)
  ;({ useLiveStudentSchedule } = await server.ssrLoadModule('/src/lib/use-live-student-schedule.ts'))
  ;({ useStudentCredits } = await server.ssrLoadModule('/src/hooks/use-student-credits.ts'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ studentQueryKeys: keys } = await server.ssrLoadModule('/src/lib/student/query-keys.ts'))
  ;({ createQueryAuthBoundary: createBoundary } = await server.ssrLoadModule('/src/lib/query-auth-boundary.ts'))
})
after(async () => { await server?.close() })

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
async function until(check, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (check()) return
    await flush()
  }
  assert.fail('Expected state was not reached')
}

function snapshot({ booked = false, occupied = 0 } = {}) {
  return { grade: 'White belt', linked: true, active: true, sessions: [{
    id: classId, name: 'Adults', starts_at: '2099-01-01T10:00:00Z', ends_at: '2099-01-01T11:00:00Z', status: 'scheduled',
    class_type_id: 'type', class_type: 'Adults', description: null, centre: 'Dojo', instructor: null,
    capacity: 10, occupied, booked, waitlisted: false, attendance_status: null, moved_from_event_id: null,
  }] }
}

function reset() {
  stub.calls.length = 0
  for (const key of Object.keys(stub.rpcs)) delete stub.rpcs[key]
  for (const key of Object.keys(stub.tables)) delete stub.tables[key]
}
const reads = name => stub.calls.filter(([kind, called]) => kind === 'rpc' && called === name).length

function fixture(hook) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const boundary = createBoundary(client)
  boundary.setUser(userId); boundary.setRole(userId, 'student')
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'student' } }
  let latest, renderer
  function Component() { latest = hook(); return null }
  async function render(show = true) {
    const tree = React.createElement(QueryClientProvider, { client },
      React.createElement(AuthContext.Provider, { value: auth }, show ? React.createElement(Component) : null))
    await act(async () => { if (renderer) renderer.update(tree); else renderer = create(tree) })
  }
  async function cleanup() { if (renderer) await act(async () => renderer.unmount()); client.clear() }
  return { client, boundary, render, cleanup, current: () => latest }
}

test('the schedule is served from cache on remount and stays visible while an invalidated refresh runs', async () => {
  reset()
  let finish
  stub.rpcs.student_class_schedule = () => reads('student_class_schedule') === 1 ? { data: snapshot(), error: null }
    : new Promise(resolve => { finish = resolve })
  const f = fixture(() => useLiveStudentSchedule())
  try {
    await f.render()
    await until(() => !f.current().loading)
    assert.equal(f.current().classes.length, 1)
    await f.render(false)
    await f.render(true)
    assert.equal(f.current().loading, false, 'remount within staleTime renders cached data')
    assert.equal(reads('student_class_schedule'), 1)
    await act(async () => { void f.client.invalidateQueries({ queryKey: keys.schedule(userId) }) })
    await until(() => Boolean(finish))
    assert.equal(f.current().loading, false)
    assert.equal(f.current().classes.length, 1)
    await act(async () => { finish({ data: snapshot({ occupied: 4 }), error: null }) })
    await until(() => f.current().classes[0].occupied === 4)
  } finally { await f.cleanup() }
})

test('a booking writes the returned snapshot into the cache and refreshes credits', async () => {
  reset()
  stub.rpcs.student_class_schedule = () => ({ data: snapshot(), error: null })
  stub.rpcs.change_student_class_booking = () => ({ data: snapshot({ booked: true, occupied: 1 }), error: null })
  const f = fixture(() => useLiveStudentSchedule())
  try {
    await f.render()
    await until(() => !f.current().loading)
    f.client.setQueryData(keys.credits(userId, null), { credits: 3, unlimited: false, expiring: null, confirmed: false })
    let result
    await act(async () => { result = await f.current().enroll(f.current().classes[0]) })
    assert.equal(result, null)
    assert.equal(f.current().isBooked(classId), true)
    assert.equal(reads('student_class_schedule'), 1, 'the RPC response replaces the cache without a refetch')
    assert.equal(f.client.getQueryState(keys.credits(userId, null)).isInvalidated, true)
  } finally { await f.cleanup() }
})

test('a booking that settles after the user changes does not touch the new cache', async () => {
  reset()
  let respond
  stub.rpcs.student_class_schedule = () => ({ data: snapshot(), error: null })
  stub.rpcs.change_student_class_booking = () => new Promise(resolve => { respond = resolve })
  const f = fixture(() => useLiveStudentSchedule())
  try {
    await f.render()
    await until(() => !f.current().loading)
    let pending
    await act(async () => { pending = f.current().enroll(f.current().classes[0]) })
    await until(() => Boolean(respond))
    await f.render(false)
    f.boundary.setUser(otherId)
    await act(async () => { respond({ data: snapshot({ booked: true }), error: null }); await pending })
    assert.equal(f.client.getQueryData(keys.schedule(userId)), undefined)
  } finally { await f.cleanup() }
})

test('credits poll quickly while a returned checkout is unconfirmed', async () => {
  reset()
  let confirmed = false
  stub.tables.credit_purchases = () => ({ data: confirmed ? { stripe_session_id: 'cs_1' } : null, error: null })
  stub.rpcs.my_credit_summary = () => ({ data: { credits: confirmed ? 5 : 0, active: true, unlimited: false }, error: null })
  const f = fixture(() => useStudentCredits(userId, 'cs_1'))
  try {
    await f.render()
    await until(() => !f.current().loading)
    assert.equal(f.current().payment, 'pending')
    confirmed = true
    await until(() => f.current().payment === 'confirmed', 150)
    assert.equal(f.current().credits, 5)
  } finally { await f.cleanup() }
})
