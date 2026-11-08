import assert from 'node:assert/strict'
import test from 'node:test'
import { sessionWrites } from './helpers/instructor-modules.mjs'

const { assessmentEditable, assessmentSnapshot } = sessionWrites
const event = { event_type: 'class', instructor_id: 'domain-instructor', status: 'completed', ends_at: '2000-01-01T00:00:00Z' }
const record = { assessment_status: null, assessment_notes: null, attendance_status: 'present' }

test('assessment snapshots contain only their own concurrency fields and preserve null versus empty', () => {
  assert.deepEqual(assessmentSnapshot(record), { status: null, notes: null })
  assert.deepEqual(assessmentSnapshot({ ...record, assessment_notes: '' }), { status: null, notes: '' })
  assert.equal(assessmentEditable({ ...event, event_type: 'grading', starts_at: null, ends_at: null }), true)
  assert.equal(assessmentEditable({ ...event, event_type: 'grading', status: 'cancelled' }), false)
})
