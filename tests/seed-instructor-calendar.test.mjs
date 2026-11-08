import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CALENDAR_TEST_PREFIX, assertCalendarSeedOwnership, buildCalendarSeedPlan,
  buildCalendarSeedRoster, calendarSeedId, calendarSeedWeek, singaporeDate,
} from '../scripts/seed-instructor-calendar.mjs'

const instructorId = '00000000-0000-4000-8000-000000000001'
const now = new Date('2026-11-05T09:00:00Z')
const centres = [
  { id: '00000000-0000-4000-8000-000000000010', name: 'Centre A', status: 'active', capacity: 24 },
  { id: '00000000-0000-4000-8000-000000000011', name: 'Centre B', status: 'active', capacity: 18 },
  { id: '00000000-0000-4000-8000-000000000012', name: 'Centre C', status: 'active', capacity: null },
]
const classTypes = [
  { id: 'mixed-family', label: 'Mixed/Family' }, { id: 'adults', label: 'Adults' },
  { id: 'children-beginners', label: 'Children Beginners' }, { id: 'children-juniors', label: 'Children Juniors' },
  { id: 'weapons', label: 'Weapons' },
]
const students = Array.from({ length: 12 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
  date_of_birth: index < 6 ? '2000-01-01' : '2016-01-01',
}))
const options = { instructorId, centres, classTypes, weekOf: '2026-11-05', now }

test('calendar fixtures stay inside the current Monday–Sunday Singapore week', () => {
  assert.equal(singaporeDate(new Date('2026-11-01T16:00:00Z')), '2026-11-02')
  const week = calendarSeedWeek('2026-11-05')
  assert.equal(week.from, '2026-11-02')
  assert.equal(week.to, '2026-11-09')
  assert.deepEqual(week.days, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
  const plan = buildCalendarSeedPlan(options)
  assert.equal(plan.events.length, 7)
  assert.equal(plan.events.filter(event => event.status === 'completed').length, 3)
  for (const event of plan.events) {
    assert.equal(event.instructor_id, instructorId)
    assert.equal(event.event_type, 'class')
    assert.ok(event.name.startsWith(CALENDAR_TEST_PREFIX))
    assert.ok(Date.parse(event.starts_at) >= Date.parse(`${week.from}T00:00:00+08:00`))
    assert.ok(Date.parse(event.ends_at) < Date.parse(`${week.to}T00:00:00+08:00`))
    assert.equal(Date.parse(event.ends_at) - Date.parse(event.starts_at), 60 * 60_000)
    assert.ok(centres.some(centre => centre.id === event.centre_id))
  }
  assert.throws(() => calendarSeedWeek('2026-02-30'), /valid calendar date/)
})

test('fixture IDs are repeatable UUIDs scoped by instructor, week and day', () => {
  const id = calendarSeedId(instructorId, '2026-11-02', 0)
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(id, calendarSeedId(instructorId, '2026-11-02', 0))
  assert.notEqual(id, calendarSeedId(centres[0].id, '2026-11-02', 0))
  assert.notEqual(id, calendarSeedId(instructorId, '2026-11-09', 0))
  assert.notEqual(id, calendarSeedId(instructorId, '2026-11-02', 1))
})

test('planning avoids existing scheduled events and availability but preserves existing fixture edits', () => {
  const initial = buildCalendarSeedPlan(options)
  const manualFixture = { ...initial.events[0], name: `${CALENDAR_TEST_PREFIX}Edited fixture`, starts_at: '2026-11-02T15:00:00+08:00', ends_at: '2026-11-02T16:00:00+08:00' }
  const scheduled = { id: 'other', name: 'Existing event', instructor_id: instructorId, event_type: 'class', status: 'scheduled',
    starts_at: '2026-11-03T18:00:00+08:00', ends_at: '2026-11-03T19:00:00+08:00' }
  const availability = [{ date: '2026-11-06', start_time: '17:00:00', end_time: '20:00:00' }]
  const planned = buildCalendarSeedPlan({ ...options, existingEvents: [manualFixture, scheduled], availability })
  assert.equal(planned.events[0], manualFixture)
  assert.notEqual(planned.events[1].starts_at, scheduled.starts_at)
  assert.notEqual(planned.events[4].starts_at, '2026-11-06T18:00:00+08:00')
  const foreign = { ...manualFixture, instructor_id: centres[0].id }
  assert.throws(() => assertCalendarSeedOwnership([foreign], instructorId), /different event/)
  assert.throws(() => buildCalendarSeedPlan({ ...options, existingEvents: [foreign] }), /different event/)
  assert.throws(() => assertCalendarSeedOwnership([{ ...manualFixture, name: 'Real event' }], instructorId), /different event/)
  assert.throws(() => buildCalendarSeedPlan({ ...options, classTypes: [] }), /existing class type/)
  assert.throws(() => buildCalendarSeedPlan({ ...options, centres: [] }), /existing active centre/)
})

test('past roster fixtures use actual student IDs and distinct attendance/check-in states', () => {
  const event = buildCalendarSeedPlan(options).events[0]
  const roster = buildCalendarSeedRoster(event, students, 'mixed-family', now)
  assert.deepEqual(roster.map(row => row.attendance_status), ['present', 'late', 'absent', 'excused', null, 'present'])
  assert.ok(roster.every(row => students.some(student => student.id === row.student_id) && row.event_id === event.id))
  assert.equal(Date.parse(roster[1].checked_in_at) - Date.parse(event.starts_at), 8 * 60_000)
  assert.equal('report' in roster[0], false)
  assert.equal('report_author_id' in roster[0], false)
  assert.equal(roster[2].checked_in_at, null)
  assert.equal(roster[4].recorded_at, null)
  assert.ok(roster.every(row => row.assessment_status === null && row.assessment_notes === null))
})

test('upcoming attendance stays unmarked and child/adult rosters use the corresponding existing members', () => {
  const plan = buildCalendarSeedPlan(options)
  const future = buildCalendarSeedRoster(plan.events[3], students, 'weapons', now)
  assert.ok(future.length > 0)
  assert.ok(future.every(row => row.attendance_status === null && row.checked_in_at === null && !('report' in row)))
  const children = buildCalendarSeedRoster(plan.events[2], students, 'children-beginners', now)
  assert.ok(children.every(row => students.find(student => student.id === row.student_id).date_of_birth === '2016-01-01'))
  assert.deepEqual(buildCalendarSeedRoster(plan.events[6], students, 'children-juniors', now, true), [])
})
