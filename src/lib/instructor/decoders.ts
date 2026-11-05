import { parseEntityId, parseInstructorRow, timestampMilliseconds } from './adapters'
import { InstructorDataError } from './errors'
import type {
  AssessmentDetail, CalendarEntry, CentreRow, ClassTypeRow, EventRow, EventStudentRow,
  GradeRequirementRow, GradeRow, GradeTrackRow, GradingApplicationRow, GradingRow,
  InstructorAvailabilityRow, Page, RosterEntry, SessionReportEntry, StudentAttendanceSummary,
  StudentDetail, StudentDirectory, StudentEntry, StudentHistoryEntry, StudentRow,
  SyllabusItemRow, TechniqueSignOffEntry, TechniqueSignOffRow,
} from './types'

type Decoder<T> = (value: unknown) => T

function invalid(): never {
  throw new InstructorDataError('invalid_data', 'The instructor data response does not match the database schema.')
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value : invalid()
}

function boolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid()
}

function integer(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : invalid()
}

export function count(value: unknown): number {
  const result = integer(value)
  return result >= 0 ? result : invalid()
}

export function nullable<T>(decode: Decoder<T>): Decoder<T | null> {
  return value => value === null ? null : decode(value)
}

export function array<T>(value: unknown, decode: Decoder<T>): T[] {
  return Array.isArray(value) ? value.map(decode) : invalid()
}

function enumeration<const Values extends readonly string[]>(...values: Values): Decoder<Values[number]> {
  return value => typeof value === 'string' && values.includes(value) ? value : invalid()
}

function row<T>(fields: { [Key in keyof T]: Decoder<T[Key]> }): Decoder<T> {
  return value => {
    const source = object(value)
    return Object.fromEntries(Object.entries(fields).map(([key, decode]) => [key, (decode as Decoder<unknown>)(source[key])])) as T
  }
}

const uuid = (value: unknown) => parseEntityId(value, 'record')
const userId = (value: unknown) => parseEntityId(value, 'auth-user')
const instructorId = (value: unknown) => parseEntityId(value, 'instructor')
const studentId = (value: unknown) => parseEntityId(value, 'student')
const centreId = (value: unknown) => parseEntityId(value, 'centre')
const eventId = (value: unknown) => parseEntityId(value, 'event')
const timestamp = (value: unknown) => { timestampMilliseconds(value); return text(value) }
export const dateOnly: Decoder<string> = value => {
  const result = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) return invalid()
  const date = new Date(`${result}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === result ? result : invalid()
}
const time: Decoder<string> = value => {
  const result = text(value)
  return /^(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?|24:00(?::00(?:\.0{1,6})?)?)$/.test(result) ? result : invalid()
}
const track = enumeration('children', 'adult')
const assessment = enumeration('pending', 'completed')
const attendance = enumeration('present', 'late', 'absent', 'excused')

export const decodeStudent = row<StudentRow>({
  id: studentId, user_id: nullable(userId), member_no: text, first_name: text, last_name: text,
  email: text, phone: nullable(text), home_centre_id: centreId, date_of_birth: dateOnly,
  current_grade_id: text, membership_status: enumeration('active', 'expired', 'pending'),
  joined_at: dateOnly, last_graded_at: nullable(dateOnly),
  follow_up_status: enumeration('none', 'flagged', 'contacted', 'resolved'), outstanding_fees: boolean,
  created_at: timestamp, updated_at: timestamp,
})
export const decodeCentre = row<CentreRow>({
  id: centreId, name: text, short_name: text, address: text, timezone: text,
  status: enumeration('active', 'closed', 'under_renovation'), capacity: nullable(integer),
  created_at: timestamp, updated_at: timestamp,
})
export const decodeGrade = row<GradeRow>({ id: text, label: text, colour: nullable(text), is_ranked: boolean, sort_order: integer })
export const decodeGradeTrack = row<GradeTrackRow>({ grade_id: text, track })
export const decodeGradeRequirement = row<GradeRequirementRow>({
  grade_id: text, track, min_months: count, max_months: nullable(count),
  min_sessions: nullable(count), min_age_years: nullable(count),
})
export const decodeSyllabusItem = row<SyllabusItemRow>({
  id: text, grade_id: text, track, category: text, sort_order: integer, label: text, note: nullable(text),
})
export const decodeClassType = row<ClassTypeRow>({ id: text, label: text, description: text })
const eventRow = row<EventRow>({
  id: eventId, event_type: enumeration('class', 'seminar', 'workshop', 'grading'), centre_id: centreId,
  instructor_id: nullable(instructorId), name: text, starts_at: nullable(timestamp), ends_at: nullable(timestamp),
  status: enumeration('scheduled', 'completed', 'cancelled'), created_at: timestamp, updated_at: timestamp,
})
export function decodeEvent(value: unknown): EventRow {
  const event = eventRow(value)
  if ((event.starts_at === null) !== (event.ends_at === null)
      || (event.starts_at === null && event.event_type !== 'grading')
      || (event.starts_at && event.ends_at && timestampMilliseconds(event.ends_at) <= timestampMilliseconds(event.starts_at))) return invalid()
  return event
}
export const decodeEventStudent = row<EventStudentRow>({
  event_id: eventId, student_id: studentId, attendance_status: nullable(attendance), recorded_at: nullable(timestamp),
  report: nullable(text), report_author_id: nullable(instructorId), assessment_status: nullable(assessment),
  assessment_notes: nullable(text), checked_in_at: nullable(timestamp),
})
export const decodeGrading = row<GradingRow>({
  event_id: eventId, track: nullable(track), application_deadline: nullable(dateOnly),
  application_status: enumeration('draft', 'open', 'closed'),
  grading_date: nullable(dateOnly), application_opens_on: nullable(dateOnly),
  reporting_release_on: nullable(dateOnly), reporting_time: nullable(time), official_schedule: boolean,
})
export const decodeApplication = row<GradingApplicationRow>({
  id: uuid, student_id: studentId, grading_event_id: eventId, target_grade_id: text, submitted_at: timestamp,
  status: enumeration('submitted', 'under_review', 'withdrawn'), notes: nullable(text),
})
export const decodeAvailability = row<InstructorAvailabilityRow>({
  id: uuid, instructor_id: instructorId, date: dateOnly, start_time: time, end_time: time,
})
const decodeSignOff = row<TechniqueSignOffRow>({
  id: uuid, student_id: studentId, syllabus_item_id: text, signed_off_at: timestamp,
  signed_off_by: nullable(instructorId), note: nullable(text),
})

export function decodeStudentEntry(value: unknown): StudentEntry {
  const source = object(value)
  const student = decodeStudent(source)
  const grade = nullable(decodeGrade)(source.grade)
  const centre = nullable(decodeCentre)(source.centre)
  if ((grade && grade.id !== student.current_grade_id) || (centre && centre.id !== student.home_centre_id)) return invalid()
  return { student, grade, centre }
}

export function decodeStudentDetail(value: unknown): StudentDetail {
  const source = object(value)
  const entry = decodeStudentEntry(source)
  const emergencyContacts = array(source.emergency_contacts, row({
    id: uuid, student_id: studentId, name: text, relationship: text, phone: text, is_primary: boolean,
  })).sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.id.localeCompare(b.id))
  const medicalAlerts = array(source.medical_alerts, row({
    id: uuid, student_id: studentId, description: text, active: boolean, recorded_at: timestamp,
  })).filter(alert => alert.active).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at) || a.id.localeCompare(b.id))
  if ([...emergencyContacts, ...medicalAlerts].some(item => item.student_id !== entry.student.id)) return invalid()
  return { ...entry, emergencyContacts, medicalAlerts }
}

export function decodePage<T>(value: unknown, decode: Decoder<T>): Page<T> {
  const source = object(value)
  const result = { items: array(source.items, decode), total: count(source.total), offset: count(source.offset), limit: count(source.limit) }
  if (result.limit < 1 || result.limit > 100 || result.items.length > result.limit || result.items.length > result.total) return invalid()
  return result
}

export function decodeDirectory(value: unknown): StudentDirectory {
  const source = object(value)
  const facets = object(source.facets)
  const page = decodePage(source, decodeStudentEntry)
  const scopeTotal = count(source.scopeTotal)
  if (page.total > scopeTotal) return invalid()
  return { ...page, scopeTotal, facets: {
    grades: array(facets.grades, decodeGrade), colours: array(facets.colours, text), centres: array(facets.centres, decodeCentre),
  } }
}

export function decodeCalendarEntry(value: unknown): CalendarEntry {
  const source = object(value)
  const event = decodeEvent(source)
  const centre = nullable(decodeCentre)(source.centre)
  const classRow = source.class === null ? null : object(source.class)
  const grading = nullable(decodeGrading)(source.grading)
  if (event.starts_at === null && !grading?.grading_date) return invalid()
  const seminar = source.seminar === null ? null : row({ event_id: eventId, external_location: nullable(text) })(source.seminar)
  const workshop = source.workshop === null ? null : row({ event_id: eventId, description: nullable(text) })(source.workshop)
  const participants = array(source.participants, item => count(object(item).count))
  if (participants.length !== 1 || (centre && centre.id !== event.centre_id)) return invalid()
  for (const [subtype, kind] of [[classRow, 'class'], [grading, 'grading'], [seminar, 'seminar'], [workshop, 'workshop']] as const) {
    if (subtype && (subtype.event_id !== event.id || event.event_type !== kind)) return invalid()
  }
  const classType = classRow ? nullable(decodeClassType)(classRow.class_type) : null
  if (classRow && classType && classRow.class_type_id !== classType.id) return invalid()
  const targets = source.grading === null ? [] : array(object(source.grading).target_grades, item => nullable(decodeGrade)(object(item).grade))
  return { event, centre, classType, grading, targetGrades: targets.filter(grade => grade !== null), seminar, workshop, rosterCount: participants[0] }
}

export function decodeRosterEntry(value: unknown): RosterEntry {
  const source = object(value)
  const record = decodeEventStudent(source.record ?? source)
  const student = decodeStudentEntry(source.student)
  if (record.student_id !== student.student.id) return invalid()
  return { record, student }
}

export function decodeHistoryEntry(value: unknown): StudentHistoryEntry {
  const source = object(value)
  const record = decodeEventStudent(source.record)
  const event = decodeEvent(source.event)
  const centre = nullable(decodeCentre)(source.centre)
  const instructor = nullable(parseInstructorRow)(source.instructor)
  const reportAuthor = nullable(parseInstructorRow)(source.reportAuthor)
  if (record.event_id !== event.id || (centre && centre.id !== event.centre_id)
      || (instructor && instructor.id !== event.instructor_id) || (reportAuthor && reportAuthor.id !== record.report_author_id)) return invalid()
  const grading = nullable(decodeGrading)(source.grading ?? null)
  if (grading && (grading.event_id !== event.id || event.event_type !== 'grading')) return invalid()
  return { record, event, centre, instructor, reportAuthor, grading, targetGrade: nullable(decodeGrade)(source.targetGrade) }
}

export function decodeSummary(value: unknown): StudentAttendanceSummary {
  const source = object(value)
  const totals = row({ pastSessions: count, present: count, late: count, absent: count, excused: count, unmarked: count,
    periodStart: nullable(timestamp), periodEnd: nullable(timestamp), cycleStart: dateOnly, cycleAttended: count, consecutiveAbsences: count })(source)
  if (totals.present + totals.late + totals.absent + totals.excused + totals.unmarked !== totals.pastSessions
      || totals.cycleAttended > totals.present + totals.late || totals.consecutiveAbsences > totals.absent) return invalid()
  const lastAttended = source.lastAttended === null ? null : {
    event: decodeEvent(object(source.lastAttended).event), centre: nullable(decodeCentre)(object(source.lastAttended).centre),
  }
  return { ...totals, lastAttended }
}

export function decodeSessionReport(value: unknown): SessionReportEntry {
  const source = object(value)
  const entry = decodeRosterEntry(source)
  const previousReports = array(source.previousReports, decodeHistoryEntry)
  if (previousReports.some(item => item.record.student_id !== entry.student.student.id)) return invalid()
  return { ...entry, previousReports }
}

export function decodeTechniqueSignOff(value: unknown): TechniqueSignOffEntry {
  const source = object(value)
  const signOff = decodeSignOff(source)
  const instructor = nullable(parseInstructorRow)(source.instructor)
  if (instructor && instructor.id !== signOff.signed_off_by) return invalid()
  return { signOff, instructor }
}

export function assertAssessment(detail: AssessmentDetail): AssessmentDetail {
  if (detail.session.event.event_type !== 'grading' || detail.record.event_id !== detail.session.event.id
      || (detail.application && (detail.application.student_id !== detail.record.student_id
        || detail.application.grading_event_id !== detail.record.event_id))) return invalid()
  return detail
}
