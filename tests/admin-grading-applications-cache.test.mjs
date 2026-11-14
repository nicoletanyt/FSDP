import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let server, stub, Page, AuthContext, loaders
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: [
      { find: '@/lib/supabase', replacement: new URL('./helpers/admin-grading-applications-stub.ts', import.meta.url).pathname },
      { find: '@', replacement: new URL('../src', import.meta.url).pathname },
    ] } })
  stub = await server.ssrLoadModule(new URL('./helpers/admin-grading-applications-stub.ts', import.meta.url).pathname)
  loaders = await server.ssrLoadModule('/src/lib/admin/grading-applications.ts')
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ default: Page } = await server.ssrLoadModule('/src/pages/admin/GradingApplications.tsx'))
})
after(async () => { await server?.close() })

const student = { first_name: 'Ada', last_name: 'Tan', member_no: '012', current_grade_id: 'white' }
const application = { id: 'app-1', submitted_at: '2026-11-14T12:00:00Z', target_grade_id: 'blue', students: student,
  gradings: { grading_date: '2026-12-01', events: { name: 'Adult grading' } } }
const grade = (id, label) => ({ id, label, colour: id, is_ranked: true, sort_order: 1 })
const grades = [grade('white', 'White'), grade('blue', 'Blue')]
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

test('loaders use the persisted applications and grades and reject failures', async () => {
  stub.calls.length = 0
  stub.data.grading_applications = { rows: [application], error: null }
  stub.data.grades = { rows: grades, error: null }
  assert.deepEqual(await loaders.loadGradingApplications(), [application])
  assert.deepEqual(await loaders.loadGradingApplicationGrades(), grades)
  assert.equal(stub.calls[0].ordered, true)
  assert.equal(stub.calls[0].table, 'grading_applications')
  assert.equal(stub.calls[1].table, 'grades')
  assert.equal(loaders.missingApplicationGrade([application], new Map(grades.map(row => [row.id, row]))), false)
  assert.equal(loaders.missingApplicationGrade([application], new Map([['white', grades[0]]])), true)
  stub.data.grades = { rows: null, error: { message: 'offline' } }
  await assert.rejects(loaders.loadGradingApplicationGrades(), /Unable to load grading applications and grades/)
})

test('page shares fresh account-scoped caches, refetches after invalidation, and recovers from missing grades', async () => {
  stub.data.grading_applications = { rows: [application], error: null }
  stub.data.grades = { rows: grades, error: null }
  stub.calls.length = 0
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity } } })
  let root
  async function mount(userId) {
    await act(async () => {
      root = create(React.createElement(QueryClientProvider, { client },
        React.createElement(AuthContext.Provider, { value: { session: { user: { id: userId } } } }, React.createElement(Page))))
    })
    await flush()
  }
  const rendered = () => JSON.stringify(root.toJSON())
  try {
    await mount('admin-a')
    assert.match(rendered(), /Ada/)
    assert.match(rendered(), /Blue/)
    assert.equal(stub.calls.length, 2)
    await act(async () => root.unmount()); root = null
    await mount('admin-a')
    assert.equal(stub.calls.length, 2, 'navigation remount reuses both cached lists')
    stub.data.grading_applications = { rows: [{ ...application, id: 'app-2', students: { ...student, first_name: 'Ben' } }], error: null }
    await act(async () => { await client.invalidateQueries({ queryKey: loaders.gradingApplicationsKey('admin-a') }) })
    await flush()
    assert.match(rendered(), /Ben/)
    assert.equal(stub.calls.length, 3, 'grade reference rows are not reloaded with each new application')
    await act(async () => root.unmount()); root = null
    await mount('admin-b')
    assert.equal(stub.calls.length, 5, 'a different account uses separate keys')
    await act(async () => root.unmount()); root = null
    stub.data.grading_applications = { rows: [application], error: null }
    stub.data.grades = { rows: [grades[0]], error: null }
    await mount('admin-c')
    assert.match(rendered(), /Unable to resolve the current or target grade/)
    stub.data.grades = { rows: grades, error: null }
    await act(async () => { await client.invalidateQueries({ queryKey: loaders.gradingApplicationGradesKey('admin-c') }) })
    await flush()
    assert.match(rendered(), /Ada/)
    stub.data.grading_applications = { rows: null, error: { message: 'offline' } }
    await act(async () => { await client.invalidateQueries({ queryKey: loaders.gradingApplicationsKey('admin-c') }) })
    await flush()
    assert.match(rendered(), /Unable to load grading applications and grades/)
    stub.data.grading_applications = { rows: [application], error: null }
    const retry = root.root.findAll(node => node.type === 'button' && node.props.onClick)
      .find(node => node.children.includes('Try again'))
    assert.ok(retry, 'a failed read offers a retry')
    await act(async () => { retry.props.onClick() })
    await flush()
    assert.match(rendered(), /Ada/)
  } finally {
    if (root) await act(async () => root.unmount())
    client.clear()
  }
})
