import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const userId = '00000000-0000-4000-8000-000000000001'
const eventId = '00000000-0000-4000-8000-000000000002'
const studentId = '00000000-0000-4000-8000-000000000003'
let server, useAttendance, AuthContext, ApiContext, coordinator, keys, createBoundary

before(async () => {
  server = await createServer({ configFile: false, resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  ;({ useInstructorAttendance: useAttendance } = await server.ssrLoadModule('/src/hooks/use-instructor-attendance.ts'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ InstructorApiContext: ApiContext } = await server.ssrLoadModule('/src/lib/instructor/data-context.ts'))
  ;({ attendanceCoordinator: coordinator } = await server.ssrLoadModule('/src/lib/instructor/attendance-coordinator.ts'))
  ;({ instructorQueryKeys: keys } = await server.ssrLoadModule('/src/lib/instructor/query-keys.ts'))
  ;({ createQueryAuthBoundary: createBoundary } = await server.ssrLoadModule('/src/lib/query-auth-boundary.ts'))
})
after(async () => { await server?.close() })

const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function until(check) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (check()) return
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  }
  assert.fail('Expected state was not reached')
}

test('two mounted views share optimistic state and serialize writes through authoritative reconciliation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  const pending = []
  const views = {}
  const roster = { session: { event: { id: eventId, status: 'scheduled', starts_at: '2099-01-01T00:00:00Z', ends_at: '2099-01-01T01:00:00Z' } }, entries: [{ record: {
    event_id: eventId, student_id: studentId, attendance_status: null, recorded_at: null, checked_in_at: null,
  } }] }
  const api = {
    getAttendanceRoster: async () => structuredClone(roster),
    saveAttendance: input => { const task = deferred(); pending.push({ input, task }); return task.promise },
  }
  function View({ name }) { views[name] = useAttendance(eventId, true); return null }
  const tree = React.createElement(QueryClientProvider, { client }, React.createElement(AuthContext.Provider, { value: auth },
    React.createElement(ApiContext.Provider, { value: api }, React.createElement(React.Fragment, null,
      React.createElement(View, { name: 'first' }), React.createElement(View, { name: 'second' })))))
  let root
  try {
    await act(async () => { root = create(tree) })
    await until(() => views.first?.data && views.second?.data)
    await act(async () => { views.first.mark('present', studentId); views.second.mark('absent', studentId) })
    assert.equal(pending.length, 1)
    await until(() => views.first.data.entries[0].record.attendance_status === 'absent' && views.second.data.entries[0].record.attendance_status === 'absent')
    assert.equal(client.getQueryData(keys.roster(userId, eventId)).entries[0].record.attendance_status, null, 'optimism never replaces the authoritative snapshot')
    roster.entries[0].record = { ...roster.entries[0].record, attendance_status: 'present' }
    await act(async () => { pending[0].task.resolve({}); await Promise.resolve() })
    await until(() => pending.length === 2)
    assert.equal(pending[1].input.expected[0].status, 'present')
    assert.notEqual(pending[0].input.requestId, pending[1].input.requestId)
    roster.entries[0].record = { ...roster.entries[0].record, attendance_status: 'absent' }
    await act(async () => { pending[1].task.resolve({}); await Promise.resolve() })
    await until(() => !views.first.pending && !views.second.pending)
    assert.equal(views.first.rows[studentId].phase, 'saved')
  } finally {
    if (root) await act(async () => root.unmount())
    client.clear()
  }
})

function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const boundary = createBoundary(client)
  boundary.setUser(userId); boundary.setRole(userId, 'instructor')
  const secondId = '00000000-0000-4000-8000-000000000004'
  let base = { session: { event: { id: eventId, status: 'scheduled', starts_at: '2099-01-01T00:00:00Z', ends_at: '2099-01-01T01:00:00Z' } },
    entries: [studentId, secondId].map(id => ({ record: { event_id: eventId, student_id: id, attendance_status: null, recorded_at: null, checked_in_at: null } })) }
  const writes = [], reads = []
  const api = {
    saveAttendance: input => { const task = deferred(); writes.push({ input: structuredClone(input), task }); return task.promise },
    getAttendanceRoster: async () => { const task = deferred(); reads.push(task); return task.promise },
  }
  client.setQueryData(keys.roster(userId, eventId), base)
  client.setQueryData(keys.attendanceWrite(userId, eventId), { pending: false, rows: {}, error: null })
  const owner = coordinator(client, api, userId, eventId)
  const state = () => client.getQueryData(keys.attendanceWrite(userId, eventId))
  async function acknowledge(index, status = writes[index].input.status) {
    const id = writes[index].input.expected[0].studentId
    base = { ...base, entries: base.entries.map(entry => entry.record.student_id === id
      ? { ...entry, record: { ...entry.record, attendance_status: status === 'unmarked' ? null : status } } : entry) }
    writes[index].task.resolve({})
    await until(() => reads.length > index)
    reads[index].resolve(base)
  }
  return { client, boundary, owner, secondId, writes, reads, state, acknowledge, base: () => base }
}

test('rapid taps coalesce unsent row intents and never overlap bulk with individual writes', async () => {
  const f = fixture()
  try {
    f.owner.mark('present', studentId)
    f.owner.mark('absent', f.secondId)
    f.owner.mark('present', f.secondId)
    f.owner.mark('absent')
    assert.equal(f.writes.length, 1)
    assert.equal(f.state().rows[f.secondId].optimistic, 'present')
    await f.acknowledge(0)
    await until(() => f.writes.length === 2)
    assert.equal(f.writes[1].input.status, 'present')
    assert.equal(f.writes[1].input.scope, 'student')
    await f.acknowledge(1)
    await until(() => !f.state().pending)
    assert.equal(f.writes.length, 2)
  } finally { f.client.clear() }
})

test('uncertain failure rolls back overlays, stops queued work and retains the exact immutable retry', async () => {
  const f = fixture()
  try {
    f.owner.mark('present', studentId)
    f.owner.mark('present', f.secondId)
    f.writes[0].task.reject(new Error('response lost'))
    await until(() => f.state().error)
    assert.equal(f.state().rows[studentId].optimistic, undefined)
    assert.equal(f.state().rows[f.secondId].phase, 'failed')
    assert.equal(f.writes.length, 1)
    const retry = f.owner.retry()
    await until(() => f.writes.length === 2)
    assert.deepEqual(f.writes[1].input, f.writes[0].input)
    f.writes[1].task.resolve({})
    await until(() => f.reads.length === 1)
    // A retry receipt is not current truth: a later server edit wins.
    const base = f.base()
    f.reads[0].resolve({ ...base, entries: base.entries.map(entry => ({ ...entry, record: { ...entry.record, attendance_status: 'absent' } })) })
    await retry
    assert.equal(f.writes.length, 2, 'queued second student is never silently replayed')
    assert.equal(f.client.getQueryData(keys.roster(userId, eventId)).entries[0].record.attendance_status, 'absent')
    assert.equal(f.state().error, null)
    assert.match(f.state().message, /server attendance differs/)
  } finally { f.client.clear() }
})

test('conflict blocks queued requests until explicit reload and displays server truth with a message', async () => {
  const f = fixture()
  try {
    f.owner.mark('present', studentId); f.owner.mark('present', f.secondId)
    f.writes[0].task.reject({ code: 'PAT01' })
    await until(() => f.state().error)
    assert.equal(f.state().retry, 'read')
    const recovery = f.owner.retry()
    await until(() => f.reads.length === 1)
    const base = f.base()
    f.reads[0].resolve({ ...base, entries: base.entries.map(entry => ({ ...entry, record: { ...entry.record, attendance_status: 'absent' } })) })
    await recovery
    assert.match(f.state().message, /Server attendance reloaded/)
    assert.equal(f.writes.length, 1)
    assert.equal(f.client.getQueryData(keys.roster(userId, eventId)).entries[0].record.attendance_status, 'absent')
  } finally { f.client.clear() }
})

test('acknowledged save with failed reload retries only the read', async () => {
  const f = fixture()
  try {
    f.owner.mark('present', studentId)
    f.writes[0].task.resolve({})
    await until(() => f.reads.length === 1)
    f.reads[0].reject(new Error('read unavailable'))
    await until(() => f.state().error)
    assert.match(f.state().error, /was saved, but the roster could not reload/)
    assert.equal(f.state().retry, 'read')
    const recovery = f.owner.retry()
    await until(() => f.reads.length === 2)
    f.reads[1].reject(new Error('read still unavailable'))
    await recovery
    assert.match(f.state().error, /was saved, but the roster could not reload/)
    assert.equal(f.state().retry, 'read')
    const again = f.owner.retry()
    await until(() => f.reads.length === 3)
    f.reads[2].resolve(f.base())
    await again
    assert.equal(f.writes.length, 1)
  } finally { f.client.clear() }
})

test('a failed conflict reload never becomes a retry write or a false saved acknowledgement', async () => {
  const f = fixture()
  try {
    f.owner.mark('present', studentId)
    f.writes[0].task.reject({ code: 'PAT01' })
    await until(() => f.state().error)
    const recovery = f.owner.retry()
    await until(() => f.reads.length === 1)
    f.reads[0].reject(new Error('offline'))
    await recovery
    assert.equal(f.state().retry, 'read')
    assert.doesNotMatch(f.state().error, /was saved|Retry save/)
    assert.equal(f.writes.length, 1)
  } finally { f.client.clear() }
})

test('account generation changes discard queued work and fence late completions, including the same user logging in again', async () => {
  const f = fixture()
  try {
    f.owner.mark('present', studentId); f.owner.mark('present', f.secondId)
    f.boundary.setUser(null); f.boundary.setUser(userId); f.boundary.setRole(userId, 'instructor')
    f.client.setQueryData(keys.roster(userId, eventId), f.base())
    f.writes[0].task.resolve({})
    await Promise.resolve(); await Promise.resolve()
    assert.equal(f.owner.current(), false)
    assert.equal(f.writes.length, 1)
    assert.equal(f.reads.length, 0)
    assert.equal(f.state(), undefined)
    assert.equal(f.client.getQueryState(keys.roster(userId, eventId)).isInvalidated, false)
  } finally { f.client.clear() }
})

test('offline work fails explicitly instead of silently replaying, and explicit retry recovers', async () => {
  const f = fixture()
  const original = Object.getOwnPropertyDescriptor(navigator, 'onLine')
  try {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    f.owner.mark('present', studentId)
    await until(() => f.state().error)
    assert.match(f.state().error, /offline/)
    assert.equal(f.state().rows[studentId].phase, 'failed')
    assert.equal(f.writes.length, 0)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    assert.equal(f.writes.length, 0, 'reconnection alone never replays work')
    const recovery = f.owner.retry()
    await until(() => f.writes.length === 1)
    await f.acknowledge(0)
    await recovery
    assert.equal(f.state().error, null)
  } finally {
    if (original) Object.defineProperty(navigator, 'onLine', original)
    else delete navigator.onLine
    f.client.clear()
  }
})

test('a late authoritative read cannot repopulate the cache after an account switch', async () => {
  const f = fixture()
  try {
    f.owner.mark('present', studentId)
    f.writes[0].task.resolve({})
    await until(() => f.reads.length === 1)
    f.boundary.setUser('00000000-0000-4000-8000-000000000099')
    f.reads[0].resolve(f.base())
    await Promise.resolve(); await Promise.resolve()
    assert.equal(f.client.getQueryData(keys.roster(userId, eventId)), undefined)
    assert.equal(f.state(), undefined)
  } finally { f.client.clear() }
})

test('a different event has an independent queue while a bulk save blocks only its own event', async () => {
  const f = fixture()
  const otherEvent = '00000000-0000-4000-8000-000000000020'
  try {
    const base = f.base()
    f.client.setQueryData(keys.roster(userId, otherEvent), { ...base, session: { event: { ...base.session.event, id: otherEvent } } })
    const other = coordinator(f.client, {
      getAttendanceRoster: async () => base,
      saveAttendance: async input => { assert.equal(input.eventId, otherEvent); return {} },
    }, userId, otherEvent)
    f.owner.mark('present')
    f.owner.mark('absent', studentId)
    other.mark('present', studentId)
    await until(() => f.client.getQueryData(keys.attendanceWrite(userId, otherEvent))?.pending === false)
    assert.equal(f.writes.length, 1)
    assert.equal(f.writes[0].input.scope, 'roster')
    assert.equal(f.state().pending, true)
    f.writes[0].task.resolve({})
    await until(() => f.reads.length === 1)
    f.reads[0].resolve(base)
    await until(() => !f.state().pending)
    assert.equal(f.writes.length, 1)
  } finally { f.client.clear() }
})

test('mutation scopes serialize functions but run onMutate early and release the next task after failure', async () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const first = deferred(), second = deferred(), calls = []
  const build = (name, task) => client.getMutationCache().build(client, {
    scope: { id: `attendance:${userId}:${eventId}` },
    onMutate: () => { calls.push(`${name}:onMutate`) },
    mutationFn: () => { calls.push(`${name}:start`); return task.promise },
  })
  try {
    const one = build('one', first).execute().catch(error => error.message)
    const two = build('two', second).execute()
    await until(() => calls.includes('one:start') && calls.includes('two:onMutate'))
    assert.equal(calls.includes('two:start'), false)
    first.reject(new Error('unknown outcome'))
    assert.equal(await one, 'unknown outcome')
    await until(() => calls.includes('two:start'))
    second.resolve('done')
    assert.equal(await two, 'done')
  } finally { client.clear() }
})
