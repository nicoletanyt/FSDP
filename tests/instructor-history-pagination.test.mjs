import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'
const studentA = '00000000-0000-4000-8000-000000000003'
const studentB = '00000000-0000-4000-8000-000000000004'
const PAGE_SIZE = 20
let server, useInstructorQuery, previousHistoryPage, keys, createBoundary, AuthContext, InstructorApiContext, StudentSessionHistory

before(async () => {
  server = await createServer({ configFile: false, resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  ;({ useInstructorQuery } = await server.ssrLoadModule('/src/hooks/use-instructor-data.ts'))
  ;({ previousHistoryPage } = await server.ssrLoadModule('/src/lib/instructor/history-placeholder.ts'))
  ;({ instructorQueryKeys: keys } = await server.ssrLoadModule('/src/lib/instructor/query-keys.ts'))
  ;({ createQueryAuthBoundary: createBoundary } = await server.ssrLoadModule('/src/lib/query-auth-boundary.ts'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ InstructorApiContext } = await server.ssrLoadModule('/src/lib/instructor/data-context.ts'))
  ;({ default: StudentSessionHistory } = await server.ssrLoadModule('/src/components/instructor/StudentSessionHistory.tsx'))
})
after(async () => { await server?.close() })

const wait = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
async function until(check) {
  for (let attempt = 0; attempt < 30; attempt++) { if (check()) return; await wait() }
  assert.fail('Expected query state was not reached')
}

function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const boundary = createBoundary(client)
  boundary.setUser(userA); boundary.setRole(userA, 'instructor')
  const requests = []
  let current, root
  const read = ({ signal, filters, userId, studentId }) => new Promise((resolve, reject) => {
    const request = { resolve, reject, signal, filters, userId, studentId }
    requests.push(request)
    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
  })
  function Component({ userId, studentId, page, attendance, sort, retainDuringWrite }) {
    const filters = { attendance, sort, page, pageSize: PAGE_SIZE }
    current = useInstructorQuery(id => keys.studentHistory(id, studentId, filters), signal => read({ signal, filters, userId, studentId }),
      { staleTime: 60_000, gcTime: Infinity, retainDuringWrite,
        placeholderData: (data, query) => previousHistoryPage(client, userId, studentId, filters, data, query) })
    return null
  }
  async function render({ userId = userA, studentId = studentA, page = 0, attendance = 'all', sort = 'newest', retainDuringWrite = false } = {}) {
    const tree = React.createElement(QueryClientProvider, { client },
      React.createElement(AuthContext.Provider, { value: { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } } },
        React.createElement(Component, { userId, studentId, page, attendance, sort, retainDuringWrite })))
    await act(async () => { if (root) root.update(tree); else root = create(tree) })
  }
  async function respond(index, page, marker = `page-${page}`) {
    await act(async () => { requests[index].resolve({ items: [marker], offset: page * PAGE_SIZE, limit: PAGE_SIZE, total: 80 }) })
    await until(() => current.status === 'success' && !current.isPlaceholderData && current.data.items[0] === marker)
  }
  async function close() { if (root) await act(async () => root.unmount()); client.clear() }
  return { client, boundary, requests, render, respond, close, current: () => current }
}

test('history page changes retain the accurately labelled previous page without caching it as the new page', async () => {
  const f = fixture()
  try {
    await f.render(); await f.respond(0, 0)
    await f.render({ page: 1 })
    assert.equal(f.current().status, 'success')
    assert.equal(f.current().isPlaceholderData, true)
    assert.equal(f.current().data.offset / PAGE_SIZE + 1, 1)
    assert.deepEqual(f.current().data.items, ['page-0'])
    assert.equal(f.client.getQueryData(keys.studentHistory(userA, studentA, { attendance: 'all', sort: 'newest', page: 1, pageSize: PAGE_SIZE })), undefined)
    await f.respond(1, 1)
    assert.equal(f.current().data.offset / PAGE_SIZE + 1, 2)
  } finally { await f.close() }
})

test('filter, sort, student and user changes never retain previous rows', async () => {
  for (const changed of [{ attendance: 'present' }, { sort: 'oldest' }, { studentId: studentB }, { userId: userB }]) {
    const f = fixture()
    try {
      await f.render(); await f.respond(0, 0)
      await f.render({ page: 1, ...changed })
      assert.equal(f.current().status, 'loading')
      assert.equal(f.current().data, null)
      assert.equal(f.current().isPlaceholderData, false)
    } finally { await f.close() }
  }
})

test('logout followed by the same user cannot reuse a removed query as a placeholder', async () => {
  const f = fixture()
  try {
    await f.render(); await f.respond(0, 0)
    await act(async () => { f.boundary.setUser(null); f.boundary.setUser(userA); f.boundary.setRole(userA, 'instructor') })
    await f.render({ page: 1 })
    assert.equal(f.current().status, 'loading')
    assert.equal(f.current().data, null)
  } finally { await f.close() }
})

test('mutation invalidation hides a placeholder even while an edit is protected', async () => {
  const f = fixture()
  try {
    await f.render(); await f.respond(0, 0)
    await f.render({ page: 1, retainDuringWrite: true })
    assert.equal(f.current().isPlaceholderData, true)
    await act(async () => { await f.client.invalidateQueries({ queryKey: keys.student(userA, studentA), refetchType: 'none' }) })
    assert.equal(f.current().status, 'loading')
    assert.equal(f.current().data, null)
    await f.respond(1, 1)
  } finally { await f.close() }
})

test('an already-invalidated source is never used as a placeholder', async () => {
  const f = fixture()
  try {
    await f.render(); await f.respond(0, 0)
    await act(async () => { await f.client.invalidateQueries({ queryKey: keys.student(userA, studentA), refetchType: 'none' }) })
    await f.render({ page: 1 })
    assert.equal(f.current().status, 'loading')
    assert.equal(f.current().data, null)
    assert.equal(f.current().isPlaceholderData, false)
  } finally { await f.close() }
})

test('failed target page shows its error and retry returns its own data', async () => {
  const f = fixture()
  try {
    await f.render(); await f.respond(0, 0)
    await f.render({ page: 1 })
    await act(async () => { f.requests[1].reject(new Error('network failure')) })
    await until(() => f.current().status === 'error')
    assert.equal(f.current().data, null)
    await act(async () => { f.current().retry() })
    await f.respond(2, 1)
    assert.deepEqual(f.current().data.items, ['page-1'])
  } finally { await f.close() }
})

test('rapid page changes cannot replace the latest page with an older response', async () => {
  const f = fixture()
  try {
    await f.render(); await f.respond(0, 0)
    await f.render({ page: 1 })
    await f.render({ page: 2 })
    assert.equal(f.requests[1].signal.aborted, true)
    assert.deepEqual(f.current().data.items, ['page-0'])
    await f.respond(2, 2)
    await act(async () => { f.requests[1].resolve({ items: ['late-page-1'], offset: PAGE_SIZE, limit: PAGE_SIZE, total: 80 }) })
    assert.deepEqual(f.current().data.items, ['page-2'])
  } finally { await f.close() }
})

test('history page controls continue to describe the visible page during a delayed switch', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const requests = []
  const api = {
    getCurrentInstructor: async () => ({ userId: userA, instructorId: userB, name: 'Instructor', email: 'test@example.test' }),
    getStudentHistory: options => new Promise(resolve => { requests.push({ options, resolve }) }),
  }
  const auth = { session: { user: { id: userA } }, profile: { id: userA, role: 'instructor' } }
  const tree = React.createElement(QueryClientProvider, { client }, React.createElement(AuthContext.Provider, { value: auth },
    React.createElement(InstructorApiContext.Provider, { value: api }, React.createElement(StudentSessionHistory, { studentId: studentA }))))
  let root
  const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('')
  try {
    await act(async () => { root = create(tree) })
    await until(() => requests.length === 1)
    await act(async () => { requests[0].resolve({ items: [], offset: 0, limit: PAGE_SIZE, total: 80 }) })
    await until(() => root.root.findAll(node => node.props['aria-label'] === 'Session history pages').length > 0)
    const next = root.root.findAllByType('button').find(button => text(button).includes('Next'))
    await act(async () => { next.props.onClick() })
    await until(() => requests.length === 2)
    const nav = root.root.find(node => node.props['aria-label'] === 'Session history pages')
    assert.match(text(nav), /Page 1 of 4/)
    assert.equal(root.root.find(node => node.props['aria-label'] === 'Session history').props['aria-busy'], true)
    await act(async () => { requests[1].resolve({ items: [], offset: PAGE_SIZE, limit: PAGE_SIZE, total: 80 }) })
    await until(() => text(root.root.find(node => node.props['aria-label'] === 'Session history pages')).includes('Page 2 of 4'))
    const nextPage = root.root.findAllByType('button').find(button => text(button).includes('Next'))
    await act(async () => { nextPage.props.onClick() })
    await until(() => requests.length === 3)
    await act(async () => { requests[2].resolve({ items: [], offset: PAGE_SIZE, limit: PAGE_SIZE, total: 80 }) })
    await until(() => root.root.findAll(node => node.props.role === 'alert').length > 0)
    assert.match(text(root.root.find(node => node.props.role === 'alert')), /does not match the requested page/)
  } finally { if (root) await act(async () => root.unmount()); client.clear() }
})
