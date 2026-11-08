import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'
import { MemoryRouter, Route, Routes } from 'react-router'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'
const student = '00000000-0000-4000-8000-000000000003'
let server, InstructorSkeleton, InstructorDataStatus, StudentDetail, AuthContext, InstructorApiContext, keys, cachedStudentPreview

before(async () => {
  server = await createServer({ configFile: false, resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  ;({ InstructorSkeleton } = await server.ssrLoadModule('/src/components/instructor/InstructorSkeletons.tsx'))
  ;({ default: InstructorDataStatus } = await server.ssrLoadModule('/src/components/instructor/InstructorDataStatus.tsx'))
  ;({ default: StudentDetail } = await server.ssrLoadModule('/src/pages/Instructor/InstructorStudentDetails.tsx'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ InstructorApiContext } = await server.ssrLoadModule('/src/lib/instructor/data-context.ts'))
  ;({ instructorQueryKeys: keys } = await server.ssrLoadModule('/src/lib/instructor/query-keys.ts'))
  ;({ cachedStudentPreview } = await server.ssrLoadModule('/src/lib/instructor/student-preview.ts'))
})
after(async () => { await server?.close() })

const wait = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
async function until(check) {
  for (let attempt = 0; attempt < 30; attempt++) { if (check()) return; await wait() }
  assert.fail('Expected loading state was not reached')
}
const text = node => typeof node === 'string' ? node : (node?.children ?? []).map(text).join('')
const entry = { student: { id: student, first_name: 'Known', last_name: 'Student', email: 'known@example.test' },
  grade: { id: 'stored-grade', label: 'Stored grade', colour: null }, centre: null }
const snapshot = { items: [entry], facets: { grades: [], colours: [], centres: [] } }

function fixture({ account = userA, profileId = account, role = 'instructor', sourceUser = account, updatedAt = Date.now(), invalidated = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(keys.directory(sourceUser), snapshot, { updatedAt })
  if (invalidated) void client.invalidateQueries({ queryKey: keys.directory(sourceUser), refetchType: 'none' })
  const requests = []
  const api = { getStudentDetail: (_id, signal) => new Promise((resolve, reject) => {
    requests.push({ resolve, reject, signal })
    signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true })
  }) }
  const auth = { session: { user: { id: account } }, profile: { id: profileId, role } }
  const tree = React.createElement(QueryClientProvider, { client }, React.createElement(AuthContext.Provider, { value: auth },
    React.createElement(InstructorApiContext.Provider, { value: api }, React.createElement(MemoryRouter, { initialEntries: [`/instructor/students/${student}`] },
      React.createElement(Routes, null, React.createElement(Route, { path: '/instructor/students/:studentId', element: React.createElement(StudentDetail) }))))))
  let root
  return { client, requests, async open() { await act(async () => { root = create(tree) }); await until(() => requests.length === 1) },
    root: () => root, async close() { if (root) await act(async () => root.unmount()); client.clear() } }
}

test('loading detail shows known name and grade but never fabricates sensitive emptiness or a detail cache entry', async () => {
  const f = fixture()
  try {
    await f.open()
    const output = text(f.root().root)
    assert.match(output, /Known Student/)
    assert.match(output, /Stored grade/)
    assert.doesNotMatch(output, /No emergency contacts recorded|No active medical alerts recorded/)
    assert.ok(f.root().root.findAll(node => node.props['aria-label'] === 'Emergency contacts and medical alerts loading').length > 0)
    assert.ok(f.root().root.findAll(node => node.props['data-slot'] === 'skeleton').length > 0)
    assert.equal(f.client.getQueryData(keys.studentDetail(userA, student)), undefined)
    await act(async () => { f.requests[0].resolve(null) })
    await until(() => text(f.root().root).includes('Student not found'))
    assert.doesNotMatch(text(f.root().root), /Known Student|No emergency contacts recorded|No active medical alerts recorded/)
  } finally { await f.close() }
})

test('preview never uses another account, a mismatched profile, invalidated or expired directory data', async () => {
  for (const options of [
    { account: userB, sourceUser: userA }, { account: userB, profileId: userA },
    { invalidated: true }, { updatedAt: Date.now() - 121_000 },
  ]) {
    const f = fixture(options)
    try {
      await f.open()
      assert.doesNotMatch(text(f.root().root), /Known Student|Stored grade/)
      assert.doesNotMatch(text(f.root().root), /No emergency contacts recorded|No active medical alerts recorded/)
    } finally { await f.close() }
  }
})

test('preview helper only returns fresh, valid same-key directory entries', async () => {
  const f = fixture()
  try {
    assert.equal(cachedStudentPreview(f.client, userA, student), entry)
    assert.equal(cachedStudentPreview(f.client, userB, student), null)
    assert.equal(cachedStudentPreview(f.client, userA, undefined), null)
    await f.client.invalidateQueries({ queryKey: keys.directory(userA), refetchType: 'none' })
    assert.equal(cachedStudentPreview(f.client, userA, student), null)
  } finally { await f.close() }
})

test('skeleton variants are accessible, noninteractive and respect reduced motion; errors still offer retry', async () => {
  for (const variant of ['inline', 'card', 'directory', 'directory-page', 'roster', 'history', 'calendar', 'calendar-page', 'reports', 'assessment', 'grading', 'grading-page', 'student-detail', 'profile', 'check-in']) {
    let root
    try {
      await act(async () => { root = create(React.createElement(MemoryRouter, null, React.createElement(InstructorSkeleton, { variant }))) })
      assert.equal(root.root.find(node => node.props['data-instructor-skeleton'] === variant).props.role, 'status')
      const bars = root.root.findAll(node => node.props['data-slot'] === 'skeleton')
      assert.ok(bars.length > 0)
      assert.ok(bars.every(node => node.props['aria-hidden'] === 'true' && node.props.className.includes('motion-reduce:animate-none')))
      if (variant !== 'student-detail') assert.equal(root.root.findAllByType('button').length, 0)
    } finally { if (root) await act(async () => root.unmount()) }
  }
  let root, retried = false
  try {
    await act(async () => { root = create(React.createElement(InstructorDataStatus, { error: 'Unable to load.', onRetry: () => { retried = true } })) })
    assert.equal(root.root.find(node => node.props.role === 'alert').children[0], 'Unable to load.')
    await act(async () => { root.root.findByType('button').props.onClick() })
    assert.equal(retried, true)
  } finally { if (root) await act(async () => root.unmount()) }
})
