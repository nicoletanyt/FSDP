import { classTemplates, currentInstructor, dateKey, students } from './instructor-calendar'
import type { CalendarEvent, Student } from './instructor-calendar'

export type CheckInRecord = {
  sessionId: string
  studentId: string
  checkedInAt: string
  source: 'qr' | 'manual'
}

export type CheckInResult =
  | { status: 'success'; student: Student; record: CheckInRecord; records: CheckInRecord[] }
  | { status: 'duplicate'; student: Student; message: string }
  | { status: 'invalid'; message: string }

// These sessions are explicitly open demo stations, independent of the calendar's clock.
export function createCheckInSessions(date = new Date()): CalendarEvent[] {
  const templateIds = ['mixed-family-fri', 'children-beginners-mon', 'adults-tue']
  return templateIds.flatMap(id => {
    const template = classTemplates.find(item => item.id === id && item.instructorId === currentInstructor.id)
    return template ? [{ ...template, id: `check-in-${template.id}-${dateKey(date)}`, date }] : []
  })
}

// Demo QR contract. Replace this parser with verification of backend-issued credentials later.
export function studentQrPayload(studentId: string) {
  return `ASK:CHECKIN:${studentId}`
}

export function validateCheckInQr(payload: string, session: CalendarEvent):
  | { valid: true; student: Student }
  | { valid: false; message: string } {
  const match = /^ASK:CHECKIN:(student-\d+)$/.exec(payload.trim())
  const student = match && students.find(item => item.id === match[1])
  if (!student) return { valid: false, message: 'Invalid QR code. Please use an ASK student check-in code.' }
  if (!session.studentIds.includes(student.id)) {
    return { valid: false, message: `${student.name} is not enrolled in this class. Check the selected session.` }
  }
  return { valid: true, student }
}

// Pure, session-scoped recording logic shared by camera and manual entry.
export function recordCheckIn(
  records: CheckInRecord[],
  session: CalendarEvent,
  studentId: string,
  source: CheckInRecord['source'],
  now = new Date(),
): CheckInResult {
  const student = students.find(item => item.id === studentId)
  if (!student || !session.studentIds.includes(studentId)) {
    return { status: 'invalid', message: 'This student is not enrolled in the selected class.' }
  }
  if (records.some(record => record.sessionId === session.id && record.studentId === studentId)) {
    return { status: 'duplicate', student, message: 'Already checked in' }
  }
  const record: CheckInRecord = { sessionId: session.id, studentId, source, checkedInAt: now.toISOString() }
  return { status: 'success', student, record, records: [...records, record] }
}
