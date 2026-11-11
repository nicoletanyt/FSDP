import type { AssessmentSnapshot, EventRow, EventStudentRow } from './types'

export function assessmentSnapshot(record: EventStudentRow): AssessmentSnapshot {
  return { status: record.assessment_status, notes: record.assessment_notes }
}

export function assessmentEditable(event: EventRow) {
  return event.event_type === 'grading' && event.status !== 'cancelled'
}
