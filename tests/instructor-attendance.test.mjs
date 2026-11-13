import assert from 'node:assert/strict'
import test from 'node:test'
import { attendance } from './helpers/instructor-modules.mjs'

const { attendanceEditable, attendanceSnapshot, editableAttendanceRows, lessonNotEnded, loadAttendanceRoster } = attendance
const startsAt = '2026-11-03T10:00:00+08:00'
const event = { id: 'event', status: 'scheduled', starts_at: startsAt, ends_at: '2026-11-03T11:00:00+08:00' }

test('attendance editing uses stored timed/scheduled end boundaries, including before-start and in-progress sessions', () => {
  assert.equal(attendanceEditable(event, new Date('2026-11-03T01:00:00Z')), true)
  assert.equal(attendanceEditable(event, new Date('2026-11-03T02:30:00Z')), true)
  assert.equal(attendanceEditable(event, new Date('2026-11-03T03:00:00Z')), false)
  for (const state of [{ ...event, status: 'completed' }, { ...event, status: 'cancelled' }, { ...event, starts_at: null, ends_at: null }]) {
    assert.equal(attendanceEditable(state, new Date('2026-11-03T01:00:00Z')), false)
  }
})

test('unavailability remains available until the lesson ends', () => {
  assert.equal(lessonNotEnded(event.ends_at, new Date('2026-11-03T01:00:00Z')), true)
  assert.equal(lessonNotEnded(event.ends_at, new Date('2026-11-03T02:30:00Z')), true)
  assert.equal(lessonNotEnded(event.ends_at, new Date('2026-11-03T03:00:00Z')), false)
  assert.equal(lessonNotEnded(event.ends_at, new Date('2026-11-03T04:00:00Z')), false)
  assert.equal(lessonNotEnded(null, new Date('2026-11-03T04:00:00Z')), true)
})

test('editable rows preserve explicit/arrival-derived late and excused states and snapshots retain original arrival evidence', () => {
  const records = ['present', 'present', 'late', 'excused', 'absent', null].map((status, index) => ({
    student_id: `student-${index}`, attendance_status: status, recorded_at: null,
    checked_in_at: index === 1 ? '2026-11-03T10:06:00+08:00' : null,
  }))
  const entries = records.map(record => ({ record }))
  assert.deepEqual(editableAttendanceRows(entries, startsAt).map(entry => entry.record.student_id), ['student-0', 'student-4', 'student-5'])
  assert.deepEqual(attendanceSnapshot(records[1]), { studentId: 'student-1', status: 'present', recordedAt: null, checkedInAt: records[1].checked_in_at })
  assert.equal(records[1].attendance_status, 'present')
})

test('attendance reload delegates to the service with the event and cancellation signal', async () => {
  const signal = new AbortController().signal
  const result = { session: { event }, entries: [] }
  const api = { getAttendanceRoster: async (id, passedSignal) => {
    assert.equal(id, 'event')
    assert.equal(passedSignal, signal)
    return result
  } }
  assert.equal(await loadAttendanceRoster(api, 'event', signal), result)
  await assert.rejects(loadAttendanceRoster({ getAttendanceRoster: async () => { throw new Error('ownership lost') } }, 'event', signal), /ownership lost/)
})
