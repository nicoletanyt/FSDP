import { InstructorDataError } from './errors'
import type {
  AttendanceState,
  AttendanceStatus,
  AuthUserId,
  CentreRow,
  EntityId,
  GradeRow,
  GradeSummary,
  InstructorIdentity,
  InstructorRow,
  StudentRow,
  StudentSummary,
  Timestamp,
} from './types'

export const INSTRUCTOR_TIME_ZONE = 'Asia/Singapore'
export const ATTENDANCE_GRACE_MINUTES = 5

export function parseEntityId<Entity extends string>(value: unknown, entity: Entity): EntityId<Entity> {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new InstructorDataError('invalid_data', `The ${entity} ID is invalid.`)
  }
  return value.toLowerCase() as EntityId<Entity>
}

export function timestampMilliseconds(value: unknown): number {
  // Offset-free timestamps would otherwise use the browser's local timezone.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new InstructorDataError('invalid_data', 'A record contains an invalid timestamp or missing timezone.')
  }
  const milliseconds = Date.parse(value)
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (!Number.isFinite(milliseconds) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new InstructorDataError('invalid_data', 'A record contains an invalid timestamp.')
  }
  return milliseconds
}

export function parseInstructorRow(value: unknown): InstructorRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InstructorDataError('invalid_data', 'The instructor record is invalid.')
  }
  const row = value as Record<string, unknown>
  for (const field of ['first_name', 'last_name', 'email', 'created_at', 'updated_at']) {
    if (typeof row[field] !== 'string') {
      throw new InstructorDataError('invalid_data', 'The instructor record is incomplete.')
    }
  }
  timestampMilliseconds(row.created_at)
  timestampMilliseconds(row.updated_at)
  return {
    id: parseEntityId(row.id, 'instructor'),
    user_id: row.user_id === null ? null : parseEntityId(row.user_id, 'auth-user'),
    first_name: row.first_name as string,
    last_name: row.last_name as string,
    email: row.email as string,
    created_at: row.created_at as Timestamp,
    updated_at: row.updated_at as Timestamp,
  }
}

export function resolveInstructorIdentity(userId: AuthUserId, instructor: InstructorRow | null): InstructorIdentity {
  if (!instructor) {
    throw new InstructorDataError('instructor_not_found', 'No instructor record is linked to your account.')
  }
  if (instructor.user_id !== userId) {
    throw new InstructorDataError('forbidden', 'The instructor record does not belong to your account.')
  }
  return {
    userId,
    instructorId: instructor.id,
    name: [instructor.first_name.trim(), instructor.last_name.trim()].filter(Boolean).join(' ') || instructor.email,
    email: instructor.email,
  }
}

export function toGradeSummary(grade: GradeRow | null): GradeSummary | null {
  return grade ? {
    id: grade.id,
    label: grade.label,
    colour: grade.colour,
    isRanked: grade.is_ranked,
    sortOrder: grade.sort_order,
  } : null
}

export function toStudentSummary(student: StudentRow, grade: GradeRow | null, centre: CentreRow | null): StudentSummary {
  if ((grade && grade.id !== student.current_grade_id) || (centre && centre.id !== student.home_centre_id)) {
    throw new InstructorDataError('invalid_data', 'The student reference records do not match.')
  }
  return {
    id: student.id,
    memberNo: student.member_no,
    name: [student.first_name.trim(), student.last_name.trim()].filter(Boolean).join(' '),
    email: student.email,
    phone: student.phone,
    homeCentre: centre ? { id: centre.id, name: centre.name, capacity: centre.capacity } : null,
    grade: toGradeSummary(grade),
    membershipStatus: student.membership_status,
  }
}

export function toAttendanceState(status: AttendanceStatus | null): AttendanceState {
  switch (status) {
    case null: return 'unmarked'
    case 'present':
    case 'late':
    case 'absent':
    case 'excused': return status
    default: throw new InstructorDataError('invalid_data', 'The attendance status is not supported by the schema.')
  }
}

// Only an actual arrival timestamp belongs here, never a later attendance edit.
// An absent arrival time is unknown, not evidence of absence or punctuality.
export function attendanceFromArrival(startsAt: Timestamp, arrivedAt: Timestamp | null): 'present' | 'late' | null {
  const start = timestampMilliseconds(startsAt)
  if (arrivedAt === null) return null
  const arrival = timestampMilliseconds(arrivedAt)
  return arrival > start + ATTENDANCE_GRACE_MINUTES * 60_000 ? 'late' : 'present'
}

const singaporeDateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: INSTRUCTOR_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function toSingaporeDateTime(timestamp: Timestamp): { date: string; time: string } {
  const parts = new Map(singaporeDateTime.formatToParts(timestampMilliseconds(timestamp)).map(part => [part.type, part.value]))
  return {
    date: `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`,
    time: `${parts.get('hour')}:${parts.get('minute')}`,
  }
}
