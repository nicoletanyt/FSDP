import { parseEntityId, parseInstructorRow, timestampMilliseconds } from './adapters'
import { InstructorDataError } from './errors'
import type {
  AssessmentDetail, AttendanceSaveResult, AttendanceSnapshot, CalendarEntry, CentreRow, ClassTypeRow, EventRow, EventStudentRow,
  GradeRequirementRow, GradeRow, GradeTrackRow, GradingApplicationRow, GradingRow,
  InstructorAvailabilityRow, Page, RosterEntry, StudentAttendanceSummary,
  StudentDetail, StudentDirectory, StudentEntry, StudentHistoryEntry, StudentRow,
  SyllabusItemRow, TechniqueSignOffEntry, TechniqueSignOffRow, AssessmentSnapshot, SessionSaveResult,
  GradingBatch, GradingSignature, AvailabilitySaveResult,
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

export function decodeGradingSignature(value: unknown): GradingSignature {
  const source = object(value)
  if (source.version !== 1) return invalid()
  const strokes = array(source.strokes, stroke => array(stroke, point => {
    const p = object(point)
    if (typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y)
      || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return invalid()
    return { x: p.x, y: p.y }
  }))
  if (!strokes.length || strokes.some(stroke => !stroke.length)) return invalid()
  return { version: 1, strokes }
}

export function decodeGradingBatch(value: unknown): GradingBatch {
  const source = object(value)
  const result = row<GradingBatch>({
    id: uuid, event_id: eventId, instructor_id: instructorId, track, target_grade_id: text,
    status: enumeration('draft', 'submitted'), version: count,
    signature: nullable(decodeGradingSignature), submitted_at: nullable(timestamp), updated_at: timestamp,
    students: v => array(v, row({ student_id: studentId, candidate_number: count, name: text, notes: nullable(text) })),
    items: v => array(v, row({ syllabus_item_id: text, category: text, label: text, sort_order: count })),
    results: v => array(v, row({ student_id: studentId, syllabus_item_id: text, checked: boolean })),
  })(source)
  const students = new Set(result.students.map(s => s.student_id))
  const items = new Set(result.items.map(i => i.syllabus_item_id))
  if (!result.version || !students.size || !items.size || students.size !== result.students.length || items.size !== result.items.length
    || result.students.some(s => s.candidate_number < 1)
    || new Set(result.students.map(s => s.candidate_number)).size !== students.size
    || result.results.length !== students.size * items.size
    || new Set(result.results.map(r => JSON.stringify([r.student_id, r.syllabus_item_id]))).size !== result.results.length
    || result.results.some(r => !students.has(r.student_id) || !items.has(r.syllabus_item_id))
    || (result.status === 'submitted' ? !result.signature || !result.submitted_at : result.signature !== null || result.submitted_at !== null)) return invalid()
  return result
}
const assessment = enumeration('pending', 'completed')
const attendance = enumeration('present', 'late', 'absent', 'excused')

export const decodeAssessmentSnapshot = row<AssessmentSnapshot>({ status: nullable(assessment), notes: nullable(text) })
export function decodeSessionSave(value: unknown): SessionSaveResult {
  const source = object(value)
  const key = { requestId: uuid(source.requestId), eventId: eventId(source.eventId), studentId: studentId(source.studentId) }
  if (source.kind === 'assessment') return { ...key, kind: 'assessment', value: decodeAssessmentSnapshot(source.value) }
  return invalid()
}

export const decodeAttendanceSnapshot = row<AttendanceSnapshot>({
  studentId, status: nullable(attendance), recordedAt: nullable(timestamp), checkedInAt: nullable(timestamp),
})

export function decodeAttendanceSave(value: unknown): AttendanceSaveResult {
  const source = object(value)
  const result = { requestId: uuid(source.requestId), eventId: eventId(source.eventId), attendance: array(source.attendance, decodeAttendanceSnapshot) }
  if (new Set(result.attendance.map(item => item.studentId)).size !== result.attendance.length) return invalid()
  return result
}

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
  assessment_status: nullable(assessment),
  assessment_notes: nullable(text), checked_in_at: nullable(timestamp),
  candidate_number: value => value === undefined ? null : nullable(count)(value),
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
export const decodeAvailabilitySnapshot = row({ date: dateOnly, startTime: time, endTime: time })

export function decodeAvailabilitySave(value: unknown): AvailabilitySaveResult {
  const result = row<AvailabilitySaveResult>({
    requestId: uuid, slotId: uuid, kind: enumeration('update', 'delete'), slot: nullable(decodeAvailability),
  })(value)
  if (result.kind === 'update' ? result.slot?.id !== result.slotId : result.slot !== null) return invalid()
  return result
}
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
  const sessions = source.grading === null ? [] : array(object(source.grading).target_grades, item => {
    const target = object(item)
    const grade = nullable(decodeGrade)(target.grade)
    if (!grade) return null
    // Older responses carry only the grade; times and counts are optional.
    const startsAt = target.starts_at == null ? null : timestamp(target.starts_at)
    const endsAt = target.ends_at == null ? null : timestamp(target.ends_at)
    if ((startsAt === null) !== (endsAt === null)) return invalid()
    return { grade, startsAt, endsAt, candidates: target.candidates == null ? 0 : count(target.candidates) }
  }).filter(session => session !== null)
  if (source.on_panel != null && typeof source.on_panel !== 'boolean') return invalid()
  return { event, centre, classType, grading, targetGrades: sessions.map(session => session.grade),
    gradeSessions: sessions, onPanel: source.on_panel === true, seminar, workshop, rosterCount: participants[0] }
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
  if (record.event_id !== event.id || (centre && centre.id !== event.centre_id)
      || (instructor && instructor.id !== event.instructor_id)) return invalid()
  const grading = nullable(decodeGrading)(source.grading ?? null)
  if (grading && (grading.event_id !== event.id || event.event_type !== 'grading')) return invalid()
  return { record, event, centre, instructor, grading, targetGrade: nullable(decodeGrade)(source.targetGrade) }
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
        || detail.application.grading_event_id !== detail.record.event_id))
      || (detail.targetGrade && detail.targetGrade.id !== detail.application?.target_grade_id)) return invalid()
  return detail
}
