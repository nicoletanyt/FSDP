import assert from 'node:assert/strict'
import test from 'node:test'
import { sessionReads } from './helpers/instructor-modules.mjs'

const { assessmentKey, loadClassReports, sessionCalendarHref, sessionDateLabel, sessionStudentHref } = sessionReads
const eventId = '00000000-0000-4000-8000-000000000001'
const studentId = '00000000-0000-4000-8000-000000000002'

test('assessment routes require an exact event/student UUID pair in canonical and legacy forms', () => {
  assert.deepEqual(assessmentKey({ eventId, studentId }), { eventId, studentId })
  assert.deepEqual(assessmentKey({ assessmentId: `${eventId}--${studentId}` }), { eventId, studentId })
  for (const params of [{ eventId }, { eventId: 'class-1', studentId }, { assessmentId: eventId },
    { assessmentId: `${eventId}--${studentId}--extra` }, { assessmentId: `${eventId}--student-1` }]) {
    assert.throws(() => assessmentKey(params), { code: 'invalid_data' })
  }
})

test('calendar/profile return links preserve actual event/student keys and Singapore/date-only dates', () => {
  const session = { event: { id: eventId, starts_at: '2026-11-02T17:00:00Z' }, grading: null }
  assert.equal(sessionDateLabel(session), '3 Nov 2026')
  assert.equal(sessionCalendarHref(session), `/instructor/calendar?session=${eventId}&date=2026-11-03`)
  const href = new URL(sessionStudentHref(session, studentId, 'grading'), 'https://example.test')
  assert.equal(href.pathname, `/instructor/students/${studentId}`)
  assert.deepEqual(Object.fromEntries(href.searchParams), { session: eventId, tab: 'grading', date: '2026-11-03' })
  const dateOnly = { event: { id: eventId, starts_at: null, ends_at: null }, grading: { grading_date: '2026-12-13' } }
  assert.equal(sessionDateLabel(dateOnly), '13 Dec 2026')
  assert.match(sessionCalendarHref(dateOnly), /date=2026-12-13/)
  assert.equal(dateOnly.event.starts_at, null)
})

test('class reports follow every server-capped page and never substitute missing or non-class events', async () => {
  const items = Array.from({ length: 205 }, (_, index) => ({ record: { event_id: eventId, student_id: `student-${index}` } }))
  const requests = []
  const api = { getEvent: async () => ({ event: { id: eventId, event_type: 'class' } }),
    getSessionReports: async (id, options) => {
      assert.equal(id, eventId); requests.push(options.offset)
      return { items: items.slice(options.offset, options.offset + 40), offset: options.offset, limit: options.limit, total: 205 }
    } }
  const signal = new AbortController().signal
  assert.equal((await loadClassReports(api, eventId, signal)).reports.length, 205)
  assert.deepEqual(requests, [0, 40, 80, 120, 160, 200])
  assert.equal(await loadClassReports({ getEvent: async () => null }, eventId, signal), null)
  assert.equal(await loadClassReports({ getEvent: async () => ({ event: { event_type: 'grading' } }) }, eventId, signal), null)
  await assert.rejects(loadClassReports({ ...api, getSessionReports: async (_id, { offset, limit }) => {
    if (offset) throw new Error('Second page failed')
    return { items: items.slice(0, 40), total: 205, offset, limit }
  } }, eventId, signal), /Second page failed/)
  await assert.rejects(loadClassReports({ ...api, getSessionReports: async () => ({ items: [{ record: { event_id: studentId, student_id: studentId } }], total: 1, offset: 0, limit: 100 }) }, eventId, signal), { code: 'invalid_data' })
})
