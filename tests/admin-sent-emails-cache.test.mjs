import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let server, stub, Log, AuthContext, Page
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: [
      { find: '@/lib/supabase', replacement: new URL('./helpers/admin-sent-emails-stub.ts', import.meta.url).pathname },
      { find: '@', replacement: new URL('../src', import.meta.url).pathname },
    ] } })
  stub = await server.ssrLoadModule(new URL('./helpers/admin-sent-emails-stub.ts', import.meta.url).pathname)
  Log = await server.ssrLoadModule('/src/lib/admin/sent-emails.ts')
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ default: Page } = await server.ssrLoadModule('/src/pages/admin/Notifications.tsx'))
})
after(async () => { await server?.close() })

const grading = { id: 'g1', grading_event_id: 'event-1', event_name: 'Adult grading', status: 'pending', recipient_count: 2,
  created_at: '2026-11-14T10:00:00Z', error: null }
const attendance = { id: 'a1', student_id: 'student-1', status: 'accepted', created_at: '2026-11-14T11:00:00Z',
  error: null, students: { first_name: 'Ada', last_name: 'Tan' } }
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })

test('sent log merges and sorts both send sources, preserves statuses, and rejects partial failures', async () => {
  stub.calls.length = 0
  stub.data.grading_email_sends = { rows: [grading], error: null }
  stub.data.admin_attendance_email_sends = { rows: [attendance], error: null }
  assert.deepEqual(await Log.loadSentEmails(), [
    { id: 'attendance-a1', date: attendance.created_at, type: 'attendance', sentTo: 'Ada Tan', status: 'accepted', error: null },
    { id: 'grading-g1', date: grading.created_at, type: 'grading', sentTo: 'Adult grading · 2 students', status: 'pending', error: null },
  ])
  assert.equal(stub.calls.find(call => call.table === 'admin_attendance_email_sends').limit, 100)
  assert.equal(stub.calls.find(call => call.table === 'grading_email_sends').limit, null)
  assert.equal(Log.sentEmailsRefreshInterval, 10_000)
  stub.data.admin_attendance_email_sends.error = { message: 'offline' }
  await assert.rejects(Log.loadSentEmails(), /Sent emails could not be loaded/)
})

test('log reuses account cache, refreshes statuses and new sends, and retries without losing previous rows', async () => {
  stub.calls.length = 0
  stub.data.grading_email_sends = { rows: [grading], error: null }
  stub.data.admin_attendance_email_sends = { rows: [attendance], error: null }
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
    assert.match(rendered(), /Adult grading/)
    assert.match(rendered(), /Ada Tan/)
    assert.equal(stub.calls.length, 2)
    assert.equal(client.getQueryCache().find({ queryKey: Log.sentEmailsKey('admin-a') }).observers[0].options.refetchInterval, 10_000)
    await act(async () => root.unmount()); root = null
    await mount('admin-a')
    assert.equal(stub.calls.length, 2, 'fresh remount uses the shared send history')
    stub.data.grading_email_sends = { rows: [{ ...grading, status: 'accepted' }, { ...grading, id: 'g2', event_name: 'New grading' }], error: null }
    await act(async () => { await client.invalidateQueries({ queryKey: Log.sentEmailsKey('admin-a') }) })
    await flush()
    assert.match(rendered(), /New grading/)
    assert.equal(client.getQueryData(Log.sentEmailsKey('admin-a')).find(row => row.id === 'grading-g1').status, 'accepted')
    assert.equal(stub.calls.length, 4)
    stub.data.admin_attendance_email_sends.error = { message: 'offline' }
    await act(async () => { await client.invalidateQueries({ queryKey: Log.sentEmailsKey('admin-a') }) })
    await flush()
    assert.match(rendered(), /Sent emails could not be loaded/)
    assert.match(rendered(), /New grading/, 'last successful rows remain visible on a failed poll')
    stub.data.admin_attendance_email_sends.error = null
    const retry = root.root.find(node => node.type === 'button' && node.children.includes('Try again'))
    await act(async () => { retry.props.onClick() })
    await flush()
    assert.doesNotMatch(rendered(), /Sent emails could not be loaded/)
    await act(async () => root.unmount()); root = null
    await mount('admin-b')
    assert.equal(stub.calls.length, 10, 'switching accounts does not reuse another administrator’s log')
  } finally {
    if (root) await act(async () => root.unmount())
    client.clear()
  }
})
