import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/dashboard-grading.ts', import.meta.url), 'utf8')
const { dashboardGradingStatus, loadDashboardGrading } = await import('data:text/javascript;base64,' +
  Buffer.from(stripTypeScriptTypes(source)).toString('base64'))
const draft = (status = 'checkout_open', created_at = '2026-11-13T10:00:00Z') => ({ target_grade_id: 'gold', status, created_at })

test('saved drafts replace the old mock No pending actions label', () => {
  assert.deepEqual(dashboardGradingStatus([], [draft()]), { status: '1 draft saved — not submitted', badge: 1 })
})
test('recorded payments are shown as confirmed requests awaiting review, not unpaid drafts', () => {
  const result = dashboardGradingStatus([], [draft('pending_review')])
  assert.match(result.status, /1 payment confirmed — awaiting dojo review/)
  assert.doesNotMatch(result.status, /draft|not submitted/)
  assert.equal(result.badge, 1)
})
test('paid requests take priority over newer unpaid checkout drafts', () => {
  const result = dashboardGradingStatus([], [draft('checkout_open', '2026-11-13T11:00:00Z'), draft('pending_review')])
  assert.equal(result.badge, 1)
  assert.match(result.status, /payment confirmed/)
  assert.doesNotMatch(result.status, /draft|not submitted/)
})
test('legacy paid flags are not labelled as unpaid drafts or confirmed receipts', () => {
  const result = dashboardGradingStatus([], [draft('preview_paid')])
  assert.match(result.status, /payment verification pending — do not pay again/)
  assert.doesNotMatch(result.status, /draft|payment confirmed/)
})
test('submitted and under-review applications supersede matching drafts', () => {
  assert.deepEqual(dashboardGradingStatus([{ target_grade_id: 'gold', status: 'submitted' }], [draft()]),
    { status: '1 submitted', badge: 1 })
  assert.deepEqual(dashboardGradingStatus([{ target_grade_id: 'gold', status: 'under_review' }], [draft()]),
    { status: '1 under review', badge: 1 })
})
test('empty data alone shows No pending actions; withdrawn applications are not pending', () => {
  assert.deepEqual(dashboardGradingStatus([], []), { status: 'No pending actions', badge: 0 })
  assert.deepEqual(dashboardGradingStatus([{ target_grade_id: 'gold', status: 'withdrawn' }], []),
    { status: 'No pending actions', badge: 0 })
})

function clientFor({ missing = false, failure = false } = {}) {
  const filters = []
  return {
    filters,
    from(table) {
      const result = table === 'students' ? { data: missing ? null : { id: 'student-id' }, error: null }
        : { data: table === 'grading_application_drafts' ? [draft()] : [], error: failure ? new Error('Database failed') : null }
      const query = {
        select: () => query,
        eq: (column, value) => { filters.push({ table, column, value }); return query },
        in: () => query,
        abortSignal: () => query,
        maybeSingle: async () => result,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
      }
      return query
    },
  }
}
test('database reads are scoped to the signed-in account and linked student', async () => {
  const client = clientFor()
  const result = await loadDashboardGrading(client, 'user-id', new AbortController().signal)
  assert.equal(result.badge, 1)
  assert.deepEqual(client.filters, [
    { table: 'students', column: 'user_id', value: 'user-id' },
    { table: 'grading_applications', column: 'student_id', value: 'student-id' },
    { table: 'grading_application_drafts', column: 'user_id', value: 'user-id' },
  ])
})
test('missing membership and database errors are not silently reported as empty actions', async () => {
  const signal = new AbortController().signal
  assert.equal((await loadDashboardGrading(clientFor({ missing: true }), 'user-id', signal)).status, 'Membership record required')
  await assert.rejects(loadDashboardGrading(clientFor({ failure: true }), 'user-id', signal), /Database failed/)
})
