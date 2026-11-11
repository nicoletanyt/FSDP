import assert from 'node:assert/strict'
import test from 'node:test'
import { sessionReads } from './helpers/instructor-modules.mjs'

const { assessmentKey, sessionCalendarHref, sessionDateLabel, sessionStudentHref } = sessionReads
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
