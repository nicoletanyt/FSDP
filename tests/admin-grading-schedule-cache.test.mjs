import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { createServer } from 'vite'

let server, stub, loadGradingSchedule, gradingScheduleKey, gradingScheduleAccountKey
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: [
      { find: '@/lib/supabase', replacement: new URL('./helpers/supabase-grading-stub.ts', import.meta.url).pathname },
      { find: '@', replacement: new URL('../src', import.meta.url).pathname },
    ] } })
  stub = await server.ssrLoadModule(new URL('./helpers/supabase-grading-stub.ts', import.meta.url).pathname)
  ;({ loadGradingSchedule, gradingScheduleKey, gradingScheduleAccountKey } = await server.ssrLoadModule('/src/lib/admin/grading-schedule.ts'))
})
after(async () => { await server?.close() })

test('official upcoming and latest 20 past gradings are fetched together using one Singapore date', async () => {
  stub.calls.length = 0
  stub.data.errors = {}
  stub.data.gradings = [{ event_id: 'up', grading_date: '2026-11-14' }, { event_id: 'past', grading_date: '2026-11-13' }]
  assert.deepEqual(await loadGradingSchedule('2026-11-14'), {
    upcoming: [stub.data.gradings[0]], past: [stub.data.gradings[1]],
  })
  assert.equal(stub.calls.filter(call => call[0] === 'select' && call[1] === 'gradings').length, 2)
  assert.equal(stub.calls.every(call => call[0] !== 'rpc'), true)
})

test('schedule cache is account/day scoped, reuses fresh data and refreshes after invalidation', async () => {
  stub.calls.length = 0
  stub.data.errors = {}
  stub.data.gradings = [{ event_id: 'up', grading_date: '2026-11-14' }]
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } })
  const today = '2026-11-14'
  const read = (id, date = today) => client.fetchQuery({ queryKey: gradingScheduleKey(id, date), queryFn: () => loadGradingSchedule(date) })
  try {
    await read('admin-a')
    await read('admin-a')
    assert.equal(stub.calls.length, 2, 'fresh upcoming and past lists are reused')
    stub.data.gradings = [{ event_id: 'new', grading_date: today }]
    await client.invalidateQueries({ queryKey: gradingScheduleAccountKey('admin-a') })
    assert.equal((await read('admin-a')).upcoming[0].event_id, 'new')
    assert.equal(stub.calls.length, 4)
    await read('admin-b')
    await read('admin-a', '2026-11-15')
    assert.equal(stub.calls.length, 8, 'another account and date each fetch their own lists')
    stub.data.errors = { gradings: { code: '42501', message: 'blocked' } }
    await assert.rejects(read('admin-c'), /Unable to load the official grading schedule/)
    stub.data.errors = {}
    assert.equal((await read('admin-c')).upcoming[0].event_id, 'new')
  } finally { client.clear(); stub.data.errors = {} }
})
