import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTime } from '../src/lib/instructor-calendar.ts'
import { calendarView, calendarQueries } from './helpers/instructor-modules.mjs'

const { calendarDateValue, calendarEventsForDate, calendarRange, rosterAttendance, rosterSizeLabel, singaporeClock, toCalendarViewEvent } = calendarView
const { collectCalendarPages, loadCalendarRange, needsCalendarEventLookup } = calendarQueries
const id = '00000000-0000-4000-8000-000000000001'
const entry = {
  event: { id, name: 'Stored session', event_type: 'class', instructor_id: null,
    starts_at: '2026-11-04T11:00:00Z', ends_at: '2026-11-04T12:00:00Z', status: 'scheduled' },
  centre: { name: 'Stored dojo', capacity: null }, classType: { id: 'database-type', label: 'Actual class type' }, rosterCount: 205,
}

test('calendar projections use Singapore time, database identity/counts and nullable capacity', () => {
  const clock = singaporeClock(new Date('2026-11-04T16:30:42Z'))
  assert.equal(calendarDateValue(clock), '2026-11-05')
  assert.equal(clock.getHours(), 0)
  assert.equal(clock.getMinutes(), 30)
  assert.equal(clock.getSeconds(), 42)
  const event = toCalendarViewEvent(entry)
  assert.equal(event.id, id)
  assert.equal(event.name, entry.event.name)
  assert.equal(event.startTime, '19:00')
  assert.equal(event.endTime, '20:00')
  assert.equal(event.classType, undefined)
  assert.equal(event.instructorId, null)
  assert.equal(rosterSizeLabel(event), '205 students')
  assert.equal('studentIds' in event, false)
  assert.equal(toCalendarViewEvent({ ...entry, event: { ...entry.event, event_type: 'seminar' } }).type, 'seminar')
  assert.equal(toCalendarViewEvent({ ...entry, event: { ...entry.event, event_type: 'workshop' } }).type, 'workshop')
})

test('cross-midnight events have clipped daily segments and an exclusive ending boundary', () => {
  const event = toCalendarViewEvent({ ...entry, event: { ...entry.event,
    starts_at: '2026-11-04T23:30:00+08:00', ends_at: '2026-11-05T01:00:00+08:00' } })
  const first = calendarEventsForDate([event], new Date(2026, 10, 4))[0]
  const second = calendarEventsForDate([event], new Date(2026, 10, 5))[0]
  assert.deepEqual([first.startTime, first.endTime], ['23:30', '24:00'])
  assert.equal(formatTime(first.endTime), '12:00 AM')
  assert.deepEqual([second.startTime, second.endTime], ['00:00', '01:00'])
  assert.equal(first.id, second.id)
  assert.equal(calendarDateValue(second.date), '2026-11-05')
  const midnightEnd = { ...event, endsAt: '2026-11-05T00:00:00+08:00' }
  assert.deepEqual(calendarEventsForDate([midnightEnd], new Date(2026, 10, 5)), [])
})

test('query ranges cover desktop grids, mobile two-day views and fourteen-day agendas', () => {
  const date = new Date(2026, 10, 4)
  assert.deepEqual(calendarRange(date, 'day', true, false), { from: '2026-11-04', to: '2026-11-05' })
  assert.deepEqual(calendarRange(date, 'week', true, false), { from: '2026-11-02', to: '2026-11-09' })
  assert.deepEqual(calendarRange(date, 'week', false, false), { from: '2026-11-04', to: '2026-11-06' })
  assert.deepEqual(calendarRange(date, 'month', true, false), { from: '2026-10-26', to: '2026-12-07' })
  assert.deepEqual(calendarRange(date, 'week', false, true), { from: '2026-11-04', to: '2026-11-18' })
})

test('selected event lookup reuses the range and falls back for deep links, missing events or errors', () => {
  assert.equal(needsCalendarEventLookup(null, true, 'success', false), false)
  assert.equal(needsCalendarEventLookup(id, true, 'loading', false), false)
  assert.equal(needsCalendarEventLookup(id, true, 'success', true), false)
  assert.equal(needsCalendarEventLookup(id, true, 'success', false), true)
  assert.equal(needsCalendarEventLookup(id, true, 'error', false), true)
  assert.equal(needsCalendarEventLookup(id, false, 'loading', false), true)
})

test('calendar and roster collectors follow server caps beyond 100 rows and reject inconsistent pages', async () => {
  const values = Array.from({ length: 205 }, (_, index) => ({ id: String(index) }))
  const offsets = []
  const signal = new AbortController().signal
  const all = await collectCalendarPages(async ({ offset, limit }) => {
    offsets.push(offset)
    return { items: values.slice(offset, offset + 40), total: values.length, offset, limit }
  }, item => item.id, signal)
  assert.equal(all.length, 205)
  assert.deepEqual(offsets, [0, 40, 80, 120, 160, 200])
  for (const load of [
    async ({ offset, limit }) => ({ items: offset ? [] : [{ id: 'one' }], total: 2, offset, limit }),
    async ({ offset, limit }) => ({ items: [{ id: 'duplicate' }], total: 2, offset, limit }),
    async ({ offset, limit }) => ({ items: [{ id: String(offset) }], total: offset ? 3 : 2, offset, limit }),
  ]) await assert.rejects(collectCalendarPages(load, item => item.id, signal), { code: 'request_failed' })
  await assert.rejects(collectCalendarPages(async () => null, item => item.id, signal), { code: 'invalid_data' })
})

test('calendar loaders preserve failures rather than substituting mock or partial data', async () => {
  const range = { from: '2026-11-04', to: '2026-11-05' }
  const api = {
    getCalendar: async ({ offset, limit, from, to }) => {
      assert.equal(from, '2026-11-04T00:00:00+08:00')
      assert.equal(to, '2026-11-05T00:00:00+08:00')
      return { items: [entry], total: 1, offset, limit }
    },
    getAvailability: async ({ offset, limit }) => ({ items: [], total: 0, offset, limit }),
    getClassTypes: async () => [],
  }
  const result = await loadCalendarRange(api, range, new AbortController().signal)
  assert.equal(result.events[0].id, id)
  assert.deepEqual(result.availability, [])
  assert.deepEqual(result.classTypes, [])
  await assert.rejects(loadCalendarRange({ ...api, getAvailability: async () => { throw new Error('Availability failed') } }, range, new AbortController().signal), /Availability failed/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(loadCalendarRange(api, range, controller.signal), { name: 'AbortError' })
})

test('roster attendance uses five-minute arrival grace and preserves explicit non-attendance states', () => {
  const record = { attendance_status: 'present', checked_in_at: '2026-11-04T11:05:00Z', recorded_at: '2026-11-04T12:00:00Z' }
  assert.equal(rosterAttendance(record, entry.event.starts_at), 'present')
  assert.equal(rosterAttendance({ ...record, checked_in_at: '2026-11-04T11:06:00Z' }, entry.event.starts_at), 'late')
  assert.equal(rosterAttendance({ ...record, checked_in_at: null, recorded_at: '2026-11-04T11:06:00Z' }, entry.event.starts_at), 'late')
  for (const status of ['absent', 'excused', null]) {
    assert.equal(rosterAttendance({ ...record, attendance_status: status }, entry.event.starts_at), status ?? 'unmarked')
  }
})
