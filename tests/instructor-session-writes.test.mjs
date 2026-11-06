import assert from 'node:assert/strict'
import test from 'node:test'
import { sessionWrites } from './helpers/instructor-modules.mjs'

const { reportEditable, reportSnapshot, assessmentEditable, assessmentSnapshot } = sessionWrites
const event = { event_type: 'class', instructor_id: 'domain-instructor', status: 'completed', ends_at: '2000-01-01T00:00:00Z' }
const record = { report: null, report_author_id: null, assessment_status: null, assessment_notes: null, attendance_status: 'present' }

test('report permissions allow past assigned classes and own reports but deny other/unknown authors and missing domain identity', () => {
  assert.equal(reportEditable(event, record, 'domain-instructor'), true)
  assert.equal(reportEditable(event, { ...record, report: 'Own report', report_author_id: 'domain-instructor' }, 'domain-instructor'), true)
  for (const [selected, row, actor] of [
    [event, record, null], [event, record, 'auth-user-id'], [event, { ...record, report: 'Unknown author' }, 'domain-instructor'],
    [event, { ...record, report_author_id: 'other-author' }, 'domain-instructor'],
    [{ ...event, status: 'cancelled' }, record, 'domain-instructor'], [{ ...event, event_type: 'grading' }, record, 'domain-instructor'],
  ]) assert.equal(reportEditable(selected, row, actor), false)
})

test('report and assessment snapshots contain only their own concurrency fields and preserve null versus empty', () => {
  assert.deepEqual(reportSnapshot(record), { report: null, reportAuthorId: null })
  assert.deepEqual(assessmentSnapshot(record), { status: null, notes: null })
  assert.deepEqual(assessmentSnapshot({ ...record, assessment_notes: '' }), { status: null, notes: '' })
  assert.equal(assessmentEditable({ ...event, event_type: 'grading', starts_at: null, ends_at: null }), true)
  assert.equal(assessmentEditable({ ...event, event_type: 'grading', status: 'cancelled' }), false)
})
