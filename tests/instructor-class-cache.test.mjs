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
let server, useInstructorAttendance, useInstructorSessionSave, useInstructorCalendarRange, useInstructorSelectedEvent, useInstructorQuery, useInstructorEditProtection, AuthContext, InstructorApiContext, keys, createBoundary, invalidateAvailability, invalidateSessionChange, queryGeneration

before(async () => {
  server = await createServer({ configFile: false, resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  ;({ useInstructorAttendance } = await server.ssrLoadModule('/src/hooks/use-instructor-attendance.ts'))
  ;({ useInstructorSessionSave } = await server.ssrLoadModule('/src/hooks/use-instructor-session-save.ts'))
  ;({ useInstructorCalendarRange, useInstructorSelectedEvent } = await server.ssrLoadModule('/src/hooks/use-instructor-class-queries.ts'))
  ;({ useInstructorQuery } = await server.ssrLoadModule('/src/hooks/use-instructor-data.ts'))
  ;({ useInstructorEditProtection } = await server.ssrLoadModule('/src/hooks/use-instructor-edit-protection.ts'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ InstructorApiContext } = await server.ssrLoadModule('/src/lib/instructor/data-context.ts'))
  ;({ instructorQueryKeys: keys } = await server.ssrLoadModule('/src/lib/instructor/query-keys.ts'))
  ;({ createQueryAuthBoundary: createBoundary } = await server.ssrLoadModule('/src/lib/query-auth-boundary.ts'))
  ;({ invalidateAvailability, invalidateSessionChange } = await server.ssrLoadModule('/src/lib/instructor/cache-invalidation.ts'))
  ;({ queryGeneration } = await server.ssrLoadModule('/src/lib/query-generation.ts'))
})
after(async () => { await server?.close() })

const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
async function until(check) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (check()) return
    await flush()
  }
  assert.fail('Expected state was not reached')
}

function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const boundary = createBoundary(client)
  boundary.setUser(userId); boundary.setRole(userId, 'instructor')
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  let latest, renderer
  function Component({ show, kind }) {
    const attendance = useInstructorAttendance(eventId, show)
    const mutation = useInstructorSessionSave(kind, { eventId, studentId })
    latest = { attendance, mutation }
    return null
  }
  async function render(api, show = true, kind = 'assessment') {
    const tree = React.createElement(QueryClientProvider, { client },
      React.createElement(AuthContext.Provider, { value: auth },
        React.createElement(InstructorApiContext.Provider, { value: api },
          React.createElement(Component, { show, kind }))))
    await act(async () => { if (renderer) renderer.update(tree); else renderer = create(tree) })
  }
  async function unmount() { if (renderer) await act(async () => renderer.unmount()); renderer = null }
  async function cleanup() { await unmount(); client.clear() }
  return { client, boundary, render, unmount, cleanup, current: () => latest }
}

function roster(status) {
  return { session: { event: { id: eventId, status: 'scheduled', starts_at: '2099-01-01T00:00:00Z', ends_at: '2099-01-01T01:00:00Z' } }, entries: [{ record: {
    event_id: eventId, student_id: studentId, attendance_status: status, recorded_at: null, checked_in_at: null,
  } }] }
}

test('closing and reopening uses fresh roster cache; stale or invalidated data fetches again', async () => {
  const f = fixture()
  let reads = 0
  const api = { getAttendanceRoster: async () => { reads++; return roster(null) } }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    assert.equal(reads, 1)
    await f.render(api, false)
    await f.render(api, true)
    assert.equal(f.current().attendance.query.status, 'success')
    assert.equal(reads, 1)
    await f.render(api, false)
    f.client.setQueryData(keys.roster(userId, eventId), roster(null), { updatedAt: Date.now() - 31_000 })
    await f.render(api, true)
    await until(() => reads === 2)
    await act(async () => { await f.client.invalidateQueries({ queryKey: keys.roster(userId, eventId) }) })
    await until(() => reads === 3)
    assert.equal(reads, 3)
  } finally { await f.cleanup() }
})

test('an empty roster is cached as success and a failed initial load remains an error', async () => {
  const f = fixture()
  let reads = 0
  const api = { getAttendanceRoster: async () => { reads++; return { ...roster(null), entries: [] } } }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    assert.deepEqual(f.current().attendance.data.entries, [])
    await f.unmount(); await f.render(api)
    assert.equal(reads, 1)
    await f.unmount(); f.client.clear()
    await f.render({ getAttendanceRoster: async () => { throw { status: 403 } } })
    await until(() => f.current().attendance.query.status === 'error')
    assert.equal(f.current().attendance.data, null)
  } finally { await f.cleanup() }
})

test('background roster invalidation keeps rows visible and surfaces read failures without enabling stale edits', async () => {
  const f = fixture()
  let fail, finishRead, reads = 0
  const api = { getAttendanceRoster: async () => {
    reads++
    if (reads === 1) return roster(null)
    if (fail) throw fail
    return new Promise(resolve => { finishRead = resolve })
  } }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    let refreshing
    await act(async () => { refreshing = f.client.invalidateQueries({ queryKey: keys.roster(userId, eventId) }) })
    await until(() => Boolean(finishRead) && f.current().attendance.refreshing)
    assert.equal(f.current().attendance.data.entries[0].record.attendance_status, null)
    await act(async () => { finishRead(roster('present')); await refreshing })
    await until(() => !f.current().attendance.refreshing)
    fail = new Error('offline')
    await act(async () => { await f.client.invalidateQueries({ queryKey: keys.roster(userId, eventId) }) })
    await until(() => Boolean(f.current().attendance.error))
    assert.equal(f.current().attendance.data.entries[0].record.attendance_status, 'present')
    assert.match(f.current().attendance.message, /Refresh failed/)
    fail = { status: 403 }
    await act(async () => { f.current().attendance.retry() })
    await until(() => f.current().attendance.query.status === 'error')
    assert.equal(f.current().attendance.data, null, 'permission loss does not retain private rows')
  } finally { await f.cleanup() }
})

test('availability changes invalidate all cached ranges only for the current auth generation', () => {
  const f = fixture()
  const one = keys.calendar(userId, '2026-11-01', '2026-11-08')
  const two = keys.calendar(userId, '2026-11-08', '2026-11-15')
  const other = keys.calendar('other-user', '2026-11-01', '2026-11-08')
  const generation = queryGeneration(f.client)
  for (const key of [one, two, other]) f.client.setQueryData(key, {})
  invalidateAvailability(f.client, generation, userId)
  assert.equal(f.client.getQueryState(one).isInvalidated, true)
  assert.equal(f.client.getQueryState(two).isInvalidated, true)
  assert.equal(f.client.getQueryState(other).isInvalidated, false)
  f.boundary.setUser(null); f.boundary.setUser(userId); f.boundary.setRole(userId, 'instructor')
  f.client.setQueryData(one, {})
  invalidateAvailability(f.client, generation, userId)
  assert.equal(f.client.getQueryState(one).isInvalidated, false)
  f.client.clear()
})

test('session changes invalidate only the affected user, student and class caches', () => {
  for (const kind of ['attendance', 'assessment']) {
    const f = fixture()
    const differentEvent = '00000000-0000-4000-8000-000000000020'
    const otherStudent = '00000000-0000-4000-8000-000000000021'
    const affected = [keys.roster(userId, eventId), keys.studentContext(userId, eventId),
      keys.studentHistory(userId, studentId, { page: 0 }), keys.studentSummary(userId, studentId),
      keys.studentGrading(userId, studentId)]
    if (kind !== 'attendance') affected.push(keys.assessment(userId, eventId, studentId))
    const otherEvent = keys.roster(userId, differentEvent)
    const unrelated = keys.studentSummary(userId, otherStudent)
    const otherUser = keys.roster('other-user', eventId)
    for (const key of [...affected, otherEvent, unrelated, otherUser]) f.client.setQueryData(key, {})
    invalidateSessionChange(f.client, queryGeneration(f.client), userId, eventId, [studentId], kind, true)
    for (const key of affected) assert.equal(f.client.getQueryState(key).isInvalidated, true, `${kind}: ${JSON.stringify(key)}`)
    assert.equal(f.client.getQueryState(otherEvent).isInvalidated, false)
    assert.equal(f.client.getQueryState(unrelated).isInvalidated, false)
    assert.equal(f.client.getQueryState(otherUser).isInvalidated, false)
    f.client.clear()
  }
})

test('calendar and selected-event queries reuse fresh results, including empty and null results', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  const calls = { calendar: 0, availability: 0, types: 0, event: 0 }
  const api = {
    getCalendar: async ({ offset, limit }) => { calls.calendar++; return { items: [], total: 0, offset, limit } },
    getAvailability: async ({ offset, limit }) => { calls.availability++; return { items: [], total: 0, offset, limit } },
    getClassTypes: async () => { calls.types++; return [] },
    getEvent: async () => { calls.event++; return null },
  }
  let current, root
  function Component() {
    current = { calendar: useInstructorCalendarRange({ from: '2026-11-04', to: '2026-11-05' }),
      selection: useInstructorSelectedEvent(eventId, true) }
    return null
  }
  const tree = React.createElement(QueryClientProvider, { client }, React.createElement(AuthContext.Provider, { value: auth },
    React.createElement(InstructorApiContext.Provider, { value: api }, React.createElement(Component))))
  try {
    await act(async () => { root = create(tree) })
    await until(() => current.calendar.status === 'success' && current.selection.status === 'success')
    assert.deepEqual(current.calendar.data.events, [])
    assert.equal(current.selection.data, null)
    assert.equal(client.getQueryCache().find({ queryKey: keys.calendar(userId, '2026-11-04', '2026-11-05') }).options.staleTime, 120_000)
    assert.equal(client.getQueryCache().find({ queryKey: keys.availability(userId, '2026-11-04', '2026-11-05') }).options.staleTime, 60_000)
    assert.equal(client.getQueryCache().find({ queryKey: keys.classTypes(userId) }).options.staleTime, 600_000)
    await act(async () => root.unmount())
    await act(async () => { root = create(tree) })
    assert.equal(current.calendar.status, 'success')
    assert.equal(current.selection.status, 'success')
    assert.deepEqual(calls, { calendar: 1, availability: 1, types: 1, event: 1 })
  } finally { if (root) await act(async () => root.unmount()); client.clear() }
})

test('attendance acknowledged after unmount invalidates the roster before reopening', async () => {
  const f = fixture()
  let reads = 0, status = null, finishSave, finishRead
  const api = {
    getAttendanceRoster: async () => {
      reads++
      if (status === 'present') return new Promise(resolve => { finishRead = () => resolve(roster(status)) })
      return roster(status)
    },
    saveAttendance: () => new Promise(resolve => { finishSave = () => { status = 'present'; resolve({}) } }),
  }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    await act(async () => { f.current().attendance.mark('present', studentId) })
    await f.unmount()
    await act(async () => { finishSave(); await Promise.resolve() })
    assert.equal(f.client.getQueryState(keys.roster(userId, eventId)).isInvalidated, true)
    await f.render(api)
    assert.equal(f.current().attendance.data.entries[0].record.attendance_status, 'present')
    await act(async () => { finishRead(); await Promise.resolve() })
    await until(() => f.current().attendance.data?.entries[0].record.attendance_status === 'present')
    assert.equal(reads, 2)
  } finally { await f.cleanup() }
})

test('unmounting the last view during reconciliation does not cancel the shared read', async () => {
  const f = fixture()
  let reads = 0, finishRead
  const api = {
    getAttendanceRoster: async (_id, signal) => {
      if (++reads === 1) return roster(null)
      return new Promise(resolve => { finishRead = () => { assert.equal(signal.aborted, false); resolve(roster('present')) } })
    },
    saveAttendance: async () => ({}),
  }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    await act(async () => { f.current().attendance.mark('present', studentId) })
    await until(() => Boolean(finishRead))
    await f.unmount()
    await act(async () => { finishRead(); await Promise.resolve() })
    await until(() => f.client.getQueryData(keys.attendanceWrite(userId, eventId))?.pending === false)
    await f.render(api)
    assert.equal(f.current().attendance.error, null)
    assert.equal(f.current().attendance.data.entries[0].record.attendance_status, 'present')
    assert.equal(reads, 2)
  } finally { await f.cleanup() }
})

test('an acknowledged save with a failed reload never exposes the old roster as current', async () => {
  const f = fixture()
  let fail = false
  const api = {
    getAttendanceRoster: async () => { if (fail) throw { status: 403 }; return roster(null) },
    saveAttendance: async () => { fail = true; return {} },
  }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    await act(async () => { f.current().attendance.mark('present', studentId) })
    await until(() => Boolean(f.current().attendance.error))
    assert.equal(f.current().attendance.data, null)
    assert.match(f.current().attendance.error, /saved, but the roster could not reload/)
    await f.unmount()
    await f.render(api)
    await until(() => Boolean(f.current().attendance.error))
    assert.equal(f.current().attendance.data, null)
  } finally { await f.cleanup() }
})

test('an uncertain attendance save restores the confirmed row and retries the same request', async () => {
  const f = fixture()
  const requests = []
  let status = null
  const api = {
    getAttendanceRoster: async () => roster(status),
    saveAttendance: async input => {
      requests.push(input)
      if (requests.length === 1) throw new Error('connection lost')
      status = 'present'
      return {}
    },
  }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    await act(async () => { f.current().attendance.mark('present', studentId) })
    await until(() => Boolean(f.current().attendance.error))
    assert.equal(f.current().attendance.data.entries[0].record.attendance_status, null)
    assert.equal(f.current().attendance.rows[studentId].phase, 'failed')
    assert.equal(f.current().attendance.retryLabel, 'Retry save')
    await act(async () => { f.current().attendance.retry() })
    await until(() => f.current().attendance.data?.entries[0].record.attendance_status === 'present')
    assert.equal(requests.length, 2)
    assert.deepEqual(requests[1], requests[0])
  } finally { await f.cleanup() }
})

test('attendance keeps the optimistic roster during acknowledgement and authoritative reload', async () => {
  const f = fixture()
  const calls = []
  let acknowledge, finishReload
  const api = {
    getAttendanceRoster: async () => {
      calls.push('read')
      if (calls.length === 1) return roster(null)
      return new Promise(resolve => { finishReload = () => resolve(roster('present')) })
    },
    saveAttendance: input => {
      calls.push('write')
      assert.equal(input.scope, 'student')
      assert.equal(input.expected.length, 1)
      return new Promise(resolve => { acknowledge = resolve })
    },
  }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    await act(async () => {
      f.current().attendance.mark('present', studentId)
    })
    assert.deepEqual(calls, ['read', 'write'])
    await until(() => f.current().attendance.pending)
    assert.equal(f.current().attendance.pending, true)
    assert.equal(f.current().attendance.refreshing, false)
    assert.equal(f.current().attendance.data.entries[0].record.attendance_status, 'present')
    await act(async () => { acknowledge({}); await Promise.resolve() })
    await until(() => Boolean(finishReload))
    assert.deepEqual(calls, ['read', 'write', 'read'])
    assert.equal(f.current().attendance.pending, true)
    assert.equal(f.current().attendance.refreshing, true)
    await until(() => f.current().attendance.refreshing)
    assert.equal(f.current().attendance.data.entries[0].record.attendance_status, 'present')
    await act(async () => { finishReload(); await Promise.resolve() })
    await until(() => !f.current().attendance.pending && f.current().attendance.data?.entries[0].record.attendance_status === 'present')
    assert.deepEqual(calls, ['read', 'write', 'read'])
  } finally { await f.cleanup() }
})

test('attendance conflict reloads server truth before a new request with a fresh snapshot', async () => {
  const f = fixture()
  const writes = []
  let status = null, reads = 0
  const api = {
    getAttendanceRoster: async () => { reads++; return roster(status) },
    saveAttendance: async input => {
      writes.push(structuredClone(input))
      if (writes.length === 1) { status = 'absent'; throw { code: 'PAT01' } }
      status = input.status
      return {}
    },
  }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    await act(async () => { f.current().attendance.mark('present', studentId) })
    await until(() => Boolean(f.current().attendance.error))
    assert.match(f.current().attendance.error, /changed/i)
    assert.equal(f.current().attendance.retryLabel, 'Reload attendance')
    assert.equal(f.current().attendance.data.entries[0].record.attendance_status, null)
    await act(async () => { f.current().attendance.retry() })
    await until(() => f.current().attendance.data?.entries[0].record.attendance_status === 'absent')
    assert.equal(reads, 2)
    await act(async () => { f.current().attendance.mark('present', studentId) })
    await until(() => f.current().attendance.data?.entries[0].record.attendance_status === 'present')
    assert.equal(reads, 3)
    assert.equal(writes.length, 2)
    assert.notEqual(writes[0].requestId, writes[1].requestId)
    assert.equal(writes[1].expected[0].status, 'absent')
  } finally { await f.cleanup() }
})

test('assessment saves invalidate active roster and old-account completions cannot affect a later login', async () => {
  const f = fixture()
  let reads = 0, notes = null, finishSave
  const api = {
    getAttendanceRoster: async () => { reads++; return { ...roster(null), notes } },
    saveAssessment: () => new Promise(resolve => { finishSave = () => { notes = 'updated'; resolve({}) } }),
    getAssessment: async () => ({ record: {}, session: {} }),
  }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    let pending
    await act(async () => { pending = f.current().mutation.save({ kind: 'assessment', status: null, notes: 'updated', expected: { status: null, notes: null } }) })
    await act(async () => { finishSave(); await pending })
    await until(() => f.current().attendance.data?.notes === 'updated')
    assert.equal(reads, 2)

    await act(async () => { pending = f.current().mutation.save({ kind: 'assessment', status: null, notes: 'again', expected: { status: null, notes: 'updated' } }) })
    await f.unmount()
    f.boundary.setUser(null); f.boundary.setUser(userId); f.boundary.setRole(userId, 'instructor')
    f.client.setQueryData(keys.roster(userId, eventId), roster('absent'))
    await act(async () => { finishSave(); await pending })
    assert.equal(f.client.getQueryState(keys.roster(userId, eventId)).isInvalidated, false)
    assert.equal(f.client.getQueryData(keys.roster(userId, eventId)).entries[0].record.attendance_status, 'absent')
  } finally { await f.cleanup() }
})

test('assessment saves invalidate the active class roster', async () => {
  const f = fixture()
  let reads = 0, assessment = 'pending'
  const api = {
    getAttendanceRoster: async () => { reads++; return { ...roster(null), assessment } },
    saveAssessment: async () => { assessment = 'completed'; return {} },
    getAssessment: async () => ({ record: {}, session: {} }),
  }
  try {
    await f.render(api, true, 'assessment')
    await until(() => f.current().attendance.query.status === 'success')
    await act(async () => { await f.current().mutation.save({ kind: 'assessment', status: 'completed', notes: null,
      expected: { status: 'pending', notes: null } }) })
    await until(() => f.current().attendance.data?.assessment === 'completed')
    assert.equal(reads, 2)
  } finally { await f.cleanup() }
})

test('session saves hide unconfirmed data when the authoritative reload fails', async () => {
  const f = fixture()
  let fail = true
  const api = {
    getAttendanceRoster: async () => roster(null),
    saveAssessment: async () => ({}),
    getAssessment: async () => { if (fail) throw { status: 403 }; return { record: { assessment_notes: 'saved' }, session: {} } },
  }
  try {
    await f.render(api)
    await until(() => f.current().attendance.query.status === 'success')
    await act(async () => { await f.current().mutation.save({ kind: 'assessment', status: null, notes: 'saved', expected: { status: null, notes: null } }) })
    assert.equal(f.current().mutation.unconfirmed, true)
    assert.match(f.current().mutation.error, /saved, but could not be reloaded/)
    fail = false
    await act(async () => { await f.current().mutation.reload() })
    assert.equal(f.current().mutation.unconfirmed, false)
    assert.equal(f.current().mutation.data.record.assessment_notes, 'saved')
  } finally { await f.cleanup() }
})

test('student query keys isolate filters and users and reuse fresh results', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  let calls = 0, current, root
  const load = async () => { calls++; return { items: [] } }
  function Component({ account, filter }) {
    current = useInstructorQuery(id => keys.studentHistory(id, studentId, { attendance: filter, page: 0 }), load,
      { staleTime: 60_000, gcTime: Infinity })
    return null
  }
  function tree(account, filter) {
    return React.createElement(QueryClientProvider, { client },
      React.createElement(AuthContext.Provider, { value: { session: { user: { id: account } }, profile: { id: account, role: 'instructor' } } },
        React.createElement(Component, { account, filter })))
  }
  try {
    await act(async () => { root = create(tree(userId, 'all')) })
    await until(() => current.status === 'success')
    await act(async () => root.update(tree(userId, 'present')))
    await until(() => current.status === 'success')
    assert.equal(calls, 2)
    await act(async () => root.update(tree(userId, 'all')))
    assert.equal(current.status, 'success')
    assert.equal(calls, 2)
    await act(async () => root.update(tree('00000000-0000-4000-8000-000000000010', 'all')))
    await until(() => current.status === 'success')
    assert.equal(calls, 3)
  } finally { if (root) await act(async () => root.unmount()); client.clear() }
})

test('failed assessment refresh keeps the editing component and its draft mounted until recovery', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const boundary = createBoundary(client)
  boundary.setUser(userId); boundary.setRole(userId, 'instructor')
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  let failRefresh = false, mutation, parent, root, unmounts = 0
  const api = {
    saveAssessment: async () => { failRefresh = true; return {} },
    getAssessment: async () => { if (failRefresh) throw { status: 403 }; return { record: { assessment_notes: 'saved' }, session: {} } },
  }
  const readHistory = async () => { if (failRefresh) throw { status: 403 }; return { items: [] } }
  function Editor() {
    const [draft] = React.useState('draft preserved')
    mutation = useInstructorSessionSave('assessment', { eventId, studentId })
    React.useEffect(() => () => { unmounts++ }, [])
    return React.createElement('span', null, draft)
  }
  function Parent() {
    const retainDuringWrite = useInstructorEditProtection(undefined, studentId)
    parent = useInstructorQuery(id => keys.studentHistory(id, studentId, { attendance: 'all' }), readHistory,
      { staleTime: 60_000, gcTime: Infinity, retainDuringWrite })
    return parent.status === 'success' ? React.createElement(Editor) : null
  }
  const tree = React.createElement(QueryClientProvider, { client }, React.createElement(AuthContext.Provider, { value: auth },
    React.createElement(InstructorApiContext.Provider, { value: api }, React.createElement(Parent))))
  try {
    await act(async () => { root = create(tree) })
    await until(() => parent.status === 'success' && mutation)
    await act(async () => { await mutation.save({ kind: 'assessment', status: null, notes: 'saved', expected: { status: null, notes: null } }) })
    await until(() => Boolean(mutation.error))
    assert.equal(parent.status, 'success')
    assert.equal(mutation.unconfirmed, true)
    assert.equal(unmounts, 0)
    assert.equal(root.toJSON().children[0], 'draft preserved')
    failRefresh = false
    await act(async () => { await mutation.reload() })
    assert.equal(mutation.unconfirmed, false)
  } finally { if (root) await act(async () => root.unmount()); client.clear() }
})
