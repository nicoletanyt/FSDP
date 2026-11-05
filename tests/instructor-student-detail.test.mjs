import assert from 'node:assert/strict'
import test from 'node:test'
import { studentDetail } from './helpers/instructor-modules.mjs'

const { attendanceTotals, historyDate, historyTimeRange, instructorName, loadStudentContext } = studentDetail

test('attendance rates use complete server aggregates, include late, and separate excused/unmarked', () => {
  assert.deepEqual(attendanceTotals({ present: 80, late: 20, absent: 25, excused: 50, unmarked: 30 }), { attended: 100, eligible: 125, rate: 80 })
  assert.deepEqual(attendanceTotals({ present: 0, late: 0, absent: 0, excused: 8, unmarked: 4 }), { attended: 0, eligible: 0, rate: null })
})

test('history uses Singapore dates and preserves cross-midnight end dates in every browser timezone', () => {
  assert.equal(historyDate('2026-11-02T17:00:00Z'), '3 Nov 2026')
  assert.equal(historyTimeRange('2026-11-02T15:30:00Z', '2026-11-02T17:00:00Z'), '23:30 – 01:00 (3 Nov 2026)')
  assert.equal(instructorName(null), 'Instructor not recorded')
  assert.equal(instructorName({ first_name: ' Actual ', last_name: ' Author ', email: 'author@example.test' }), 'Actual Author')
})

test('UUID session context follows every roster page rather than a calendar slice', async () => {
  const requests = []
  const signal = new AbortController().signal
  const roster = Array.from({ length: 205 }, (_, i) => ({ student: { student: { id: `student-${i}` } } }))
  const context = await loadStudentContext({
    async getEvent(id) { return { event: { id } } },
    async getRoster(id, options) {
      requests.push({ id, ...options })
      return { offset: options.offset, limit: options.limit, total: 205, items: roster.slice(options.offset, options.offset + 40) }
    },
  }, 'real-event-uuid', signal)
  assert.equal(context.roster.length, 205)
  assert.deepEqual(requests.map(request => request.offset), [0, 40, 80, 120, 160, 200])
  assert.ok(requests.every(request => request.id === 'real-event-uuid' && request.signal === signal))
  assert.equal(await loadStudentContext({ getEvent: async () => null }, 'unassigned-event', signal), null)
})

test('a failed roster page cannot become a partial session context', async () => {
  await assert.rejects(loadStudentContext({ getEvent: async () => ({ event: {} }), getRoster: async (_id, options) => {
    if (options.offset) throw new Error('Roster failed')
    return { offset: 0, limit: 100, total: 2, items: [{ student: { student: { id: 'one' } } }] }
  } }, 'event', new AbortController().signal), /Roster failed/)
})
