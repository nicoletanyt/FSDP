import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let server, stub, loadOpenGradingEvents, openGradingEventsKey, singaporeGradingDate
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: [
      { find: '@/lib/supabase', replacement: new URL('./helpers/admin-open-gradings-stub.ts', import.meta.url).pathname },
      { find: '@', replacement: new URL('../src', import.meta.url).pathname },
    ] } })
  stub = await server.ssrLoadModule(new URL('./helpers/admin-open-gradings-stub.ts', import.meta.url).pathname)
  ;({ loadOpenGradingEvents, openGradingEventsKey, singaporeGradingDate } = await server.ssrLoadModule('/src/lib/admin/section-counts.ts'))
})
after(async () => { await server?.close() })

const today = '2026-11-14'
const event = (id, grading = {}) => ({ id, name: id, gradings: [{ track: 'adult', grading_date: '2026-11-15', application_opens_on: today,
  application_deadline: today, ...grading }] })

test('the open grading loader preserves Singapore-day eligibility and propagates failures', async () => {
  assert.equal(singaporeGradingDate(new Date('2026-11-13T16:05:00Z')), today)
  stub.configure([event('valid'), event('future', { application_opens_on: '2026-11-15' }),
    event('expired', { application_deadline: '2026-11-13' }), event('today', { grading_date: today }),
    event('wrong-track', { track: 'other' }), { ...event('children', { track: 'children' }), gradings: event('children', { track: 'children' }).gradings[0] }])
  assert.deepEqual(await loadOpenGradingEvents(today), [
    { id: 'valid', name: 'valid', track: 'adult' }, { id: 'children', name: 'children', track: 'children' },
  ])
  assert.equal(stub.calls[0].table, 'events')
  assert.deepEqual(stub.calls[0].filters, [['event_type', 'grading'], ['status', 'scheduled'],
    ['gradings.official_schedule', true], ['gradings.application_status', 'open']])
  stub.configure([], { message: 'offline' })
  await assert.rejects(loadOpenGradingEvents(today), error => error.message === 'offline')
})

test('open gradings share fresh account/date cache, refetch on invalidation, and retry errors', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false, gcTime: Infinity } } })
  stub.configure([event('first')])
  let root, latest
  function View({ userId, day }) {
    latest = useQuery({ queryKey: openGradingEventsKey(userId, day), queryFn: () => loadOpenGradingEvents(day), enabled: Boolean(userId), retry: false })
    return null
  }
  const render = async (userId, day = today) => {
    await act(async () => {
      const element = React.createElement(QueryClientProvider, { client }, React.createElement(View, { userId, day }))
      if (root) root.update(element)
      else root = create(element)
    })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  }
  try {
    await render('admin-a')
    assert.deepEqual(latest.data, [{ id: 'first', name: 'first', track: 'adult' }])
    assert.equal(stub.calls.length, 1)
    await act(async () => root.unmount()); root = null
    await render('admin-a')
    assert.equal(stub.calls.length, 1)
    stub.configure([event('changed')])
    await act(async () => { await client.invalidateQueries({ queryKey: openGradingEventsKey('admin-a', today) }) })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    assert.equal(latest.data[0].id, 'changed')
    assert.equal(stub.calls.length, 1)
    await render('admin-b')
    assert.equal(stub.calls.length, 2)
    await render('admin-b', '2026-11-15')
    assert.equal(stub.calls.length, 3)
    stub.configure([], { message: 'offline' })
    await render('admin-c')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
    assert.equal(client.getQueryState(openGradingEventsKey('admin-c', today)).status, 'error')
    stub.configure([event('recovered')])
    await act(async () => { await client.refetchQueries({ queryKey: openGradingEventsKey('admin-c', today) }) })
    assert.equal(client.getQueryData(openGradingEventsKey('admin-c', today))[0].id, 'recovered')
  } finally {
    if (root) await act(async () => root.unmount())
    client.clear()
  }
})
