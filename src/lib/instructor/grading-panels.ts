import { InstructorDataError } from './errors'

export interface PanelExaminer {
  instructorId: string
  name: string
  isChief: boolean
}

// A grading session the signed-in instructor examines, from my_grading_panels().
export interface ExaminerSession {
  eventId: string
  name: string
  status: 'scheduled' | 'completed' | 'cancelled'
  track: 'adult' | 'children' | null
  gradingDate: string
  startsAt: string | null
  endsAt: string | null
  reportingTime: string | null
  isChief: boolean
  centre: { name: string; address: string }
  candidates: number
  panel: PanelExaminer[]
}

const invalid = () => new InstructorDataError('invalid_data', 'Your grading sessions contain invalid data.')
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
  return value as Record<string, unknown>
}
const text = (value: unknown) => { if (typeof value !== 'string') throw invalid(); return value }
const optionalText = (value: unknown) => value === null || value === undefined ? null : text(value)
const flag = (value: unknown) => { if (typeof value !== 'boolean') throw invalid(); return value }

export function decodeExaminerSessions(value: unknown): ExaminerSession[] {
  if (!Array.isArray(value)) throw invalid()
  return value.map(item => {
    const row = record(item)
    const centre = record(row.centre)
    const status = text(row.status)
    const track = optionalText(row.track)
    const gradingDate = text(row.grading_date)
    if (!['scheduled', 'completed', 'cancelled'].includes(status) || (track !== null && !['adult', 'children'].includes(track))
      || !/^\d{4}-\d{2}-\d{2}$/.test(gradingDate) || !Number.isInteger(row.candidates) || !Array.isArray(row.panel)) throw invalid()
    return {
      eventId: text(row.event_id), name: text(row.name), status: status as ExaminerSession['status'],
      track: track as ExaminerSession['track'], gradingDate,
      startsAt: optionalText(row.starts_at), endsAt: optionalText(row.ends_at), reportingTime: optionalText(row.reporting_time),
      isChief: flag(row.is_chief), centre: { name: text(centre.name), address: text(centre.address) },
      candidates: row.candidates as number,
      panel: row.panel.map(member => {
        const examiner = record(member)
        return { instructorId: text(examiner.instructor_id), name: text(examiner.name), isChief: flag(examiner.is_chief) }
      }),
    }
  })
}

// Card and page title. The date is shown on its own line, so the title names
// the track rather than repeating the date stored in the event name.
export function gradingTitle(session: { name: string; track: 'adult' | 'children' | null }) {
  return session.track ? `${session.track === 'adult' ? 'Adult' : "Children's"} grading` : session.name
}

// Upcoming sessions soonest first; past and cancelled sessions most recent first.
export function groupExaminerSessions(sessions: ExaminerSession[], today: string) {
  const upcoming = sessions.filter(session => session.status === 'scheduled' && session.gradingDate >= today)
  const past = sessions.filter(session => !upcoming.includes(session)).reverse()
  return { upcoming, past }
}

export type GradingGrade = { id: string; label: string; colour: string | null; is_ranked: boolean; sort_order: number }

export interface GradingCandidate {
  applicationId: string
  studentId: string
  name: string
  memberNo: string | null
  candidateNumber: number | null
  currentGrade: GradingGrade | null
}

// Every applicant for the day, sorted into a session or not.
export interface DayStudent extends GradingCandidate {
  targetGrade: GradingGrade
  sessionId: string | null
}

// A time slot on the grading day; it can hold several target grades.
export interface GradingSessionSummary {
  id: string
  position: number
  startsAt: string | null
  endsAt: string | null
  grades: { grade: GradingGrade; candidates: GradingCandidate[] }[]
  // Each current grade -> target grade in the session, with its scheduled length.
  transitions: { from: GradingGrade | null; to: GradingGrade; candidates: number; minutes: number }[]
  myBatch: { status: 'draft' | 'submitted'; updatedAt: string; submittedAt: string | null } | null
}

// One grading day from examiner_grading_day(): the session, its panel, every
// applicant and, once an administrator has sorted them, its sessions.
export type ScheduleWarningCode = 'overflow' | 'over_capacity' | 'mixed_lengths' | 'empty_session' | 'unscheduled' | 'default_capacity'

// Something about the draft schedule an administrator should check (admins and the chief only).
export interface ScheduleWarning {
  code: ScheduleWarningCode
  message: string
  sessionIds: string[]
}

export interface GradingDay extends Omit<ExaminerSession, 'candidates'> {
  applicationDeadline: string | null
  gradingStarted: boolean
  // Private gradings are scheduled by hand rather than by the scheduler.
  isPrivate: boolean
  // Null while the schedule is a draft. Only admins and the chief see draft sessions.
  publishedAt: string | null
  capacity: number | null
  warnings: ScheduleWarning[]
  students: DayStudent[]
  sessions: GradingSessionSummary[]
}

export const sessionLabel = (position: number) => `Session ${position}`
export const sessionCandidates = (session: Pick<GradingSessionSummary, 'grades'>) =>
  session.grades.reduce((sum, item) => sum + item.candidates.length, 0)

const optionalInteger = (value: unknown) => {
  if (value === null || value === undefined) return null
  if (!Number.isInteger(value)) throw invalid()
  return value as number
}

function decodeGrade(value: unknown): GradingGrade {
  const grade = record(value)
  if (!Number.isInteger(grade.sort_order)) throw invalid()
  return { id: text(grade.id), label: text(grade.label), colour: optionalText(grade.colour),
    is_ranked: flag(grade.is_ranked), sort_order: grade.sort_order as number }
}

const warningCodes: ScheduleWarningCode[] = ['overflow', 'over_capacity', 'mixed_lengths', 'empty_session', 'unscheduled', 'default_capacity']

function decodeWarning(value: unknown): ScheduleWarning {
  const warning = record(value)
  const code = text(warning.code)
  if (!warningCodes.includes(code as ScheduleWarningCode) || !Array.isArray(warning.session_ids)) throw invalid()
  return { code: code as ScheduleWarningCode, message: text(warning.message), sessionIds: warning.session_ids.map(text) }
}

function decodeTransition(value: unknown): GradingSessionSummary['transitions'][number] {
  const transition = record(value)
  if (!Number.isInteger(transition.candidates) || !Number.isInteger(transition.minutes)) throw invalid()
  return {
    from: transition.from === null || transition.from === undefined ? null : decodeGrade(transition.from),
    to: decodeGrade(transition.to), candidates: transition.candidates as number, minutes: transition.minutes as number,
  }
}

function decodeCandidate(value: unknown): GradingCandidate {
  const person = record(value)
  return { applicationId: text(person.application_id), studentId: text(person.student_id), name: text(person.name),
    memberNo: optionalText(person.member_no), candidateNumber: optionalInteger(person.candidate_number),
    currentGrade: person.current_grade === null || person.current_grade === undefined ? null : decodeGrade(person.current_grade) }
}

export function decodeGradingDay(value: unknown): GradingDay {
  const row = record(value)
  const [session] = decodeExaminerSessions([{ ...row, candidates: 0 }])
  if (!Array.isArray(row.students) || !Array.isArray(row.sessions)) throw invalid()
  const { candidates: _ignored, ...rest } = session
  void _ignored
  const applicationDeadline = optionalText(row.application_deadline)
  if (applicationDeadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(applicationDeadline)) throw invalid()
  return {
    ...rest,
    applicationDeadline,
    gradingStarted: flag(row.grading_started),
    isPrivate: flag(row.is_private),
    publishedAt: optionalText(row.published_at),
    capacity: optionalInteger(row.capacity),
    warnings: Array.isArray(row.warnings) ? row.warnings.map(decodeWarning) : [],
    students: row.students.map(item => {
      const person = record(item)
      return { ...decodeCandidate(person), targetGrade: decodeGrade(person.target_grade), sessionId: optionalText(person.session_id) }
    }),
    sessions: row.sessions.map(item => {
      const entry = record(item)
      if (!Number.isInteger(entry.position) || !Array.isArray(entry.grades)) throw invalid()
      const batch = entry.my_batch === null || entry.my_batch === undefined ? null : record(entry.my_batch)
      const startsAt = optionalText(entry.starts_at)
      const endsAt = optionalText(entry.ends_at)
      if ((startsAt === null) !== (endsAt === null)) throw invalid()
      if (batch && !['draft', 'submitted'].includes(text(batch.status))) throw invalid()
      return {
        id: text(entry.id), position: entry.position as number, startsAt, endsAt,
        grades: entry.grades.map(group => {
          const grouped = record(group)
          if (!Array.isArray(grouped.candidates)) throw invalid()
          return { grade: decodeGrade(grouped.grade), candidates: grouped.candidates.map(decodeCandidate) }
        }),
        transitions: Array.isArray(entry.transitions) ? entry.transitions.map(decodeTransition) : [],
        myBatch: batch ? { status: text(batch.status) as 'draft' | 'submitted', updatedAt: text(batch.updated_at),
          submittedAt: optionalText(batch.submitted_at) } : null,
      }
    }),
  }
}
