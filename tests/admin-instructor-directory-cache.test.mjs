import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let server, stub, Directory, AuthContext, Page
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: [
      { find: '@/lib/supabase', replacement: new URL('./helpers/admin-instructors-stub.ts', import.meta.url).pathname },
      { find: '@', replacement: new URL('../src', import.meta.url).pathname },
    ] } })
  stub = await server.ssrLoadModule(new URL('./helpers/admin-instructors-stub.ts', import.meta.url).pathname)
  Directory = await server.ssrLoadModule('/src/lib/admin/instructor-directory.ts')
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ default: Page } = await server.ssrLoadModule('/src/pages/admin/Instructors.tsx'))
})
after(async () => { await server?.close() })

const person = (id, examiner = false) => ({ id, first_name: 'Ada', last_name: 'Tan', email: `${id}@example.com`,
  instructors: { id: `instructor-${id}`, is_examiner: examiner, grade: null } })
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

test('the instructor directory reads accounts with their examiner flags and propagates failures', async () => {
  stub.configure([person('a')])
  assert.deepEqual(await Directory.loadInstructorDirectory(), [person('a')])
  assert.ok(stub.calls.some(call => call[0] === 'eq' && call[2] === 'role' && call[3] === 'instructor'))
  assert.equal(stub.calls.filter(call => call[0] === 'order').length, 2)
  stub.configure([], { message: 'offline' })
  await assert.rejects(Directory.loadInstructorDirectory(), /Unable to load instructor accounts/)
})

test('fresh remounts reuse the scoped directory; saves and retry refresh it', async () => {
  stub.configure([person('a')])
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity } } })
  let root
  async function mount(id) {
    await act(async () => {
      root = create(React.createElement(QueryClientProvider, { client },
        React.createElement(AuthContext.Provider, { value: { session: { user: { id } } } }, React.createElement(Page))))
    })
    await flush()
  }
  const reads = () => stub.calls.filter(call => call[0] === 'select' && call[1] === 'users').length
  const rendered = () => JSON.stringify(root.toJSON())
  try {
    await mount('admin-a')
    assert.match(rendered(), /a@example.com/)
    assert.equal(reads(), 1)
    await act(async () => root.unmount()); root = null
    await mount('admin-a')
    assert.equal(reads(), 1)
    stub.rows.push(person('b'))
    await act(async () => { await client.invalidateQueries({ queryKey: Directory.instructorDirectoryKey('admin-a') }) })
    await flush()
    assert.match(rendered(), /b@example.com/)
    assert.equal(reads(), 2)
    const toggle = root.root.findAll(node => node.type === 'input' && node.props['aria-label'] === 'Ada Tan can examine gradings')[0]
    await act(async () => { toggle.props.onChange({ target: { checked: true } }) })
    await flush()
    assert.equal(stub.rows[0].instructors.is_examiner, true)
    assert.equal(reads(), 3, 'a successful examiner update reloads the directory')
    assert.equal(root.root.findAll(node => node.type === 'input' && node.props['aria-label'] === 'Ada Tan can examine gradings')[0].props.checked, true)
    stub.failUpdate({ code: 'PGP03', message: 'assigned to a panel' })
    await act(async () => { toggle.props.onChange({ target: { checked: false } }) })
    await flush()
    assert.equal(reads(), 3, 'failed updates do not invalidate the directory')
    assert.equal(root.root.findAll(node => node.type === 'input' && node.props['aria-label'] === 'Ada Tan can examine gradings')[0].props.checked, true)
    stub.failUpdate(null)
    await act(async () => root.unmount()); root = null
    await mount('admin-b')
    assert.equal(reads(), 4, 'a different account cannot reuse the prior account’s cache')
    await act(async () => root.unmount()); root = null
    stub.configure([], { message: 'offline' })
    await mount('admin-c')
    assert.match(rendered(), /Unable to load instructor accounts/)
    stub.configure([person('recovered')])
    const retry = root.root.find(node => node.type === 'button' && node.children.includes('Retry'))
    await act(async () => { retry.props.onClick() })
    await flush()
    assert.match(rendered(), /recovered@example.com/)
  } finally {
    if (root) await act(async () => root.unmount())
    client.clear()
  }
})
