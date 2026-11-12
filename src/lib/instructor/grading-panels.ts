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

export interface GradingCandidate {
  studentId: string
  name: string
  memberNo: string | null
  candidateNumber: number | null
  currentGrade: GradeSession['grade'] | null
}

export interface GradeSession {
  grade: { id: string; label: string; colour: string | null; is_ranked: boolean; sort_order: number }
  candidates: GradingCandidate[]
  startsAt: string | null
  endsAt: string | null
  myBatch: { status: 'draft' | 'submitted'; updatedAt: string; submittedAt: string | null } | null
}

// One grading day from examiner_grading_day(): the session, its panel, and a
// grading session per target grade on its track.
export interface GradingDay extends Omit<ExaminerSession, 'candidates'> {
  grades: GradeSession[]
}

const optionalInteger = (value: unknown) => {
  if (value === null || value === undefined) return null
  if (!Number.isInteger(value)) throw invalid()
  return value as number
}

function decodeGrade(value: unknown): GradeSession['grade'] {
  const grade = record(value)
  if (!Number.isInteger(grade.sort_order)) throw invalid()
  return { id: text(grade.id), label: text(grade.label), colour: optionalText(grade.colour),
    is_ranked: flag(grade.is_ranked), sort_order: grade.sort_order as number }
}

export function decodeGradingDay(value: unknown): GradingDay {
  const row = record(value)
  const [session] = decodeExaminerSessions([{ ...row, candidates: 0 }])
  if (!Array.isArray(row.grades)) throw invalid()
  const { candidates: _ignored, ...rest } = session
  void _ignored
  return {
    ...rest,
    grades: row.grades.map(item => {
      const entry = record(item)
      if (!Array.isArray(entry.candidates)) throw invalid()
      const batch = entry.my_batch === null || entry.my_batch === undefined ? null : record(entry.my_batch)
      const startsAt = optionalText(entry.starts_at)
      const endsAt = optionalText(entry.ends_at)
      if ((startsAt === null) !== (endsAt === null)) throw invalid()
      if (batch && !['draft', 'submitted'].includes(text(batch.status))) throw invalid()
      return {
        grade: decodeGrade(entry.grade),
        candidates: entry.candidates.map(candidate => {
          const person = record(candidate)
          return { studentId: text(person.student_id), name: text(person.name), memberNo: optionalText(person.member_no),
            candidateNumber: optionalInteger(person.candidate_number),
            currentGrade: person.current_grade === null || person.current_grade === undefined ? null : decodeGrade(person.current_grade) }
        }),
        startsAt, endsAt,
        myBatch: batch ? { status: text(batch.status) as 'draft' | 'submitted', updatedAt: text(batch.updated_at),
          submittedAt: optionalText(batch.submitted_at) } : null,
      }
    }),
  }
}
