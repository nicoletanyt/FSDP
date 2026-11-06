import type { AssessmentSnapshot, EventRow, EventStudentRow, InstructorId, ReportSnapshot } from './types'

export function reportSnapshot(record: EventStudentRow): ReportSnapshot {
  return { report: record.report, reportAuthorId: record.report_author_id }
}

export function assessmentSnapshot(record: EventStudentRow): AssessmentSnapshot {
  return { status: record.assessment_status, notes: record.assessment_notes }
}

export function reportEditable(event: EventRow, record: EventStudentRow, instructorId: InstructorId | null) {
  return instructorId !== null && event.instructor_id === instructorId && event.event_type === 'class' && event.status !== 'cancelled'
    // Match the existing SQL author's btrim(report) check for legacy rows too.
    && (record.report_author_id === instructorId || (!record.report?.replace(/^ +| +$/g, '') && record.report_author_id === null))
}

export function assessmentEditable(event: EventRow) {
  return event.event_type === 'grading' && event.status !== 'cancelled'
}
