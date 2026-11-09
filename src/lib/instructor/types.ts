import type { UserRole } from '../auth'

// UUID identities are distinct even though Supabase transports each as a string.
declare const entityId: unique symbol
export type EntityId<Entity extends string> = string & { readonly [entityId]: Entity }
export type AuthUserId = EntityId<'auth-user'>
export type InstructorId = EntityId<'instructor'>
export type StudentId = EntityId<'student'>
export type CentreId = EntityId<'centre'>
export type EventId = EntityId<'event'>

// PostgreSQL date/time values stay strings at the transport boundary.
export type DateOnly = string
export type TimeOnly = string
export type Timestamp = string
// Reference IDs are database-owned text, not the mock UI's rank/class slugs.
export type GradeId = string

export type GradeTrack = 'children' | 'adult'
export type MembershipStatus = 'active' | 'expired' | 'pending'
export type FollowUpStatus = 'none' | 'flagged' | 'contacted' | 'resolved'
export type CentreStatus = 'active' | 'closed' | 'under_renovation'
export type EventType = 'class' | 'seminar' | 'workshop' | 'grading'
export type EventStatus = 'scheduled' | 'completed' | 'cancelled'
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'
export type AssessmentStatus = 'pending' | 'completed'
export type GradingWindowStatus = 'draft' | 'open' | 'closed'
export type ApplicationStatus = 'submitted' | 'under_review' | 'withdrawn'
export type GradingEmailSendStatus = 'pending' | 'accepted' | 'failed'

// Row shapes follow docs/database-schema.md; no synthetic IDs or demo fields.
export interface UserRow {
  id: AuthUserId
  first_name: string
  last_name: string
  email: string
  role: UserRole
  phone: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface InstructorRow {
  id: InstructorId
  user_id: AuthUserId | null
  first_name: string
  last_name: string
  email: string
  created_at: Timestamp
}

export interface StudentRow {
  id: StudentId
  user_id: AuthUserId | null
  member_no: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  home_centre_id: CentreId
  date_of_birth: DateOnly
  current_grade_id: GradeId
  membership_status: MembershipStatus
  joined_at: DateOnly
  last_graded_at: DateOnly | null
  follow_up_status: FollowUpStatus
  outstanding_fees: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

export interface CentreRow {
  id: CentreId
  name: string
  short_name: string
  address: string
  timezone: string
  status: CentreStatus
  capacity: number | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface EmergencyContactRow {
  id: string
  student_id: StudentId
  name: string
  relationship: string
  phone: string
  is_primary: boolean
}

export interface StudentMedicalAlertRow {
  id: string
  student_id: StudentId
  description: string
  active: boolean
  recorded_at: Timestamp
}

export interface GradeRow {
  id: GradeId
  label: string
  colour: string | null
  is_ranked: boolean
  sort_order: number
}

export interface GradeTrackRow {
  grade_id: GradeId
  track: GradeTrack
}

export interface GradeRequirementRow {
  grade_id: GradeId
  track: GradeTrack
  min_months: number
  max_months: number | null
  min_sessions: number | null
  min_age_years: number | null
}

export interface SyllabusItemRow {
  id: string
  grade_id: GradeId
  track: GradeTrack
  category: string
  sort_order: number
  label: string
  note: string | null
}

export interface ClassTypeRow {
  id: string
  label: string
  description: string
}

export interface EventRow {
  id: EventId
  event_type: EventType
  centre_id: CentreId
  instructor_id: InstructorId | null
  name: string
  starts_at: Timestamp | null
  ends_at: Timestamp | null
  status: EventStatus
  created_at: Timestamp
  updated_at: Timestamp
}

export interface ClassRow {
  event_id: EventId
  class_type_id: string
}

export interface SeminarRow {
  event_id: EventId
  external_location: string | null
}

export interface WorkshopRow {
  event_id: EventId
  description: string | null
}

export interface GradingRow {
  event_id: EventId
  track: GradeTrack | null
  application_deadline: DateOnly | null
  application_status: GradingWindowStatus
  grading_date: DateOnly | null
  application_opens_on: DateOnly | null
  reporting_release_on: DateOnly | null
  reporting_time: TimeOnly | null
  official_schedule: boolean
}

export interface GradingTargetGradeRow {
  grading_event_id: EventId
  grade_id: GradeId
}

export interface EventStudentRow {
  event_id: EventId
  student_id: StudentId
  attendance_status: AttendanceStatus | null
  recorded_at: Timestamp | null
  assessment_status: AssessmentStatus | null
  assessment_notes: string | null
  checked_in_at: Timestamp | null
  candidate_number?: number | null
}

export interface GradingSignature { version: 1; strokes: { x: number; y: number }[][] }
export interface GradingBatchCell { student_id: StudentId; syllabus_item_id: string; checked: boolean }
export interface GradingBatch {
  id: string
  event_id: EventId
  instructor_id: InstructorId
  track: GradeTrack
  target_grade_id: string
  status: 'draft' | 'submitted'
  version: number
  signature: GradingSignature | null
  submitted_at: Timestamp | null
  updated_at: Timestamp
  students: { student_id: StudentId; candidate_number: number; name: string; notes: string | null }[]
  items: { syllabus_item_id: string; category: string; label: string; sort_order: number }[]
  results: GradingBatchCell[]
}
export interface GradingBatchKey { eventId: EventId; track: GradeTrack; gradeId: string }
export interface GradingBatchSaveInput extends GradingBatchKey {
  requestId: string
  expectedUserId: AuthUserId
  expectedVersion: number
  cells: GradingBatchCell[]
  submit: boolean
  signature: GradingSignature | null
}

export type AttendanceMark = 'present' | 'absent' | 'unmarked'

export interface AttendanceSnapshot {
  studentId: StudentId
  status: AttendanceStatus | null
  recordedAt: Timestamp | null
  checkedInAt: Timestamp | null
}

export interface AttendanceSaveInput {
  requestId: string
  expectedUserId: AuthUserId
  eventId: EventId
  scope: 'student' | 'roster'
  status: AttendanceMark
  expected: AttendanceSnapshot[]
}

export interface AttendanceSaveResult {
  requestId: string
  eventId: EventId
  attendance: AttendanceSnapshot[]
}

export interface AssessmentSnapshot { status: AssessmentStatus | null; notes: string | null }
interface SessionSaveKey extends AssessmentKey { requestId: string; expectedUserId: AuthUserId }
export interface AssessmentSaveInput extends SessionSaveKey { status: AssessmentStatus | null; notes: string | null; expected: AssessmentSnapshot }
export type SessionSaveInput = { kind: 'assessment' } & AssessmentSaveInput
export type SessionSaveResult = { requestId: string; eventId: EventId; studentId: StudentId; kind: 'assessment'; value: AssessmentSnapshot }

export interface GradingApplicationRow {
  id: string
  student_id: StudentId
  grading_event_id: EventId
  target_grade_id: GradeId
  submitted_at: Timestamp
  status: ApplicationStatus
  notes: string | null
}

// The current schema scopes these to student/item, not an assessment attempt.
export interface TechniqueSignOffRow {
  id: string
  student_id: StudentId
  syllabus_item_id: string
  signed_off_at: Timestamp
  signed_off_by: InstructorId | null
  note: string | null
}

export interface InstructorAvailabilityRow {
  id: string
  instructor_id: InstructorId
  date: DateOnly
  start_time: TimeOnly
  end_time: TimeOnly
}

export interface AvailabilityInput {
  date: DateOnly
  startTime: TimeOnly
  endTime: TimeOnly
}

export type AvailabilitySaveInput = {
  requestId: string
  expectedUserId: AuthUserId
  slotId: string
  expected: AvailabilityInput
} & ({ kind: 'update'; value: AvailabilityInput } | { kind: 'delete'; value?: never })

export interface AvailabilitySaveResult {
  requestId: string
  slotId: string
  kind: 'update' | 'delete'
  slot: InstructorAvailabilityRow | null
}

// Includes the project owner's live DDL additions, documented in the schema.
export interface GradingEmailSendRow {
  id: string
  grading_event_id: EventId | null
  status: GradingEmailSendStatus
  recipient_count: number
  created_at: Timestamp
  completed_at: Timestamp | null
  error: string | null
  event_name: string | null
  campaign_key: string | null
}

export interface InstructorIdentity {
  userId: AuthUserId
  instructorId: InstructorId
  name: string
  email: string
}

export interface AssessmentKey {
  eventId: EventId
  studentId: StudentId
}

export type AttendanceState = AttendanceStatus | 'unmarked'

export interface GradeSummary {
  id: GradeId
  label: string
  colour: string | null
  isRanked: boolean
  sortOrder: number
}

export interface StudentSummary {
  id: StudentId
  memberNo: string
  name: string
  email: string
  phone: string | null
  homeCentre: Pick<CentreRow, 'id' | 'name' | 'capacity'> | null
  grade: GradeSummary | null
  membershipStatus: MembershipStatus
}

// Readiness means ready to START an assessment. Techniques belong to assessment.
export type ReadinessRequirementKey = 'membership' | 'membership-length' | 'age' | 'time' | 'sessions' | 'fees'

export interface ReadinessRequirement {
  key: ReadinessRequirementKey
  met: boolean | null
  actual: number | string | null
  required: number | string
}

export interface PageOptions {
  limit?: number
  offset?: number
  signal?: AbortSignal
}

export interface Page<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}

export interface StudentEntry {
  student: StudentRow
  grade: GradeRow | null
  centre: CentreRow | null
}

export interface StudentDetail extends StudentEntry {
  emergencyContacts: EmergencyContactRow[]
  medicalAlerts: StudentMedicalAlertRow[]
}

export interface DirectoryOptions extends PageOptions {
  search?: string
  gradeId?: GradeId
  colour?: string
  centreId?: CentreId
}

export interface StudentDirectory extends Page<StudentEntry> {
  scopeTotal: number
  facets: { grades: GradeRow[]; colours: string[]; centres: CentreRow[] }
}

export interface InstructorReferenceData {
  centres: CentreRow[]
  grades: GradeRow[]
  gradeTracks: GradeTrackRow[]
  gradeRequirements: GradeRequirementRow[]
  syllabusItems: SyllabusItemRow[]
  classTypes: ClassTypeRow[]
}

export interface CalendarEntry {
  event: EventRow
  centre: CentreRow | null
  classType: ClassTypeRow | null
  grading: GradingRow | null
  targetGrades: GradeRow[]
  seminar: SeminarRow | null
  workshop: WorkshopRow | null
  rosterCount: number
}

export interface CalendarOptions extends PageOptions {
  from: Timestamp
  to: Timestamp
}

export interface RosterEntry {
  record: EventStudentRow
  student: StudentEntry
}

export interface StudentHistoryEntry {
  record: EventStudentRow
  event: EventRow
  centre: CentreRow | null
  instructor: InstructorRow | null
  targetGrade: GradeRow | null
  grading: GradingRow | null
}

export interface HistoryOptions extends PageOptions {
  eventType?: EventType
  attendance?: AttendanceState
  oldestFirst?: boolean
  recordedAssessmentsOnly?: boolean
}

export interface StudentAttendanceSummary {
  pastSessions: number
  present: number
  late: number
  absent: number
  excused: number
  unmarked: number
  periodStart: Timestamp | null
  periodEnd: Timestamp | null
  cycleStart: DateOnly
  cycleAttended: number
  consecutiveAbsences: number
  lastAttended: { event: EventRow; centre: CentreRow | null } | null
}

export interface TechniqueSignOffEntry {
  signOff: TechniqueSignOffRow
  instructor: InstructorRow | null
}

export interface AssessmentDetail extends RosterEntry {
  session: CalendarEntry
  application: GradingApplicationRow | null
  targetGrade: GradeRow | null
}
