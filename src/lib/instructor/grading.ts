import { collectCalendarPages } from './calendar-queries'
import type { InstructorApi } from './calendar-queries'
import { dateOnly } from './decoders'
import { directoryTrack } from './directory'
import type {
  GradeRow, InstructorReferenceData, ReadinessRequirement, StudentAttendanceSummary,
  StudentDetail, StudentHistoryEntry, TechniqueSignOffEntry,
} from './types'

function monthsElapsed(start: string | null, today: string): number | null {
  if (!start || start > today) return null
  dateOnly(start)
  return (Number(today.slice(0, 4)) - Number(start.slice(0, 4))) * 12
    + Number(today.slice(5, 7)) - Number(start.slice(5, 7)) - Number(today.slice(8) < start.slice(8))
}

export interface StudentGradingReads {
  reference: InstructorReferenceData
  summary: StudentAttendanceSummary
  signOffs: TechniqueSignOffEntry[]
  assessments: StudentHistoryEntry[]
}

export async function loadStudentGrading(api: InstructorApi, studentId: StudentDetail['student']['id'], signal: AbortSignal): Promise<StudentGradingReads> {
  const [reference, summary, signOffs, assessments] = await Promise.all([
    api.getReferenceData(signal), api.getStudentSummary(studentId, signal), api.getTechniqueSignOffs(studentId, signal),
    collectCalendarPages(options => api.getRecordedAssessments(studentId, options), item => `${item.record.event_id}:${item.record.student_id}`, signal),
  ])
  return { reference, summary, signOffs, assessments }
}

export function studentGrading(detail: StudentDetail, reads: StudentGradingReads, today: string) {
  dateOnly(today)
  const { student } = detail
  const track = directoryTrack(student.date_of_birth, today)
  const current = reads.reference.grades.find(grade => grade.id === student.current_grade_id) ?? null
  const ladder = track ? reads.reference.grades.filter(grade => reads.reference.gradeTracks.some(row => row.grade_id === grade.id && row.track === track))
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)) : []
  const target: GradeRow | null = current ? ladder.find(grade => grade.sort_order > current.sort_order) ?? null : null
  const spec = target ? reads.reference.gradeRequirements.find(row => row.grade_id === target.id && row.track === track) ?? null : null
  const requirements: ReadinessRequirement[] = []
  if (spec && current && track) {
    const membershipMonths = monthsElapsed(student.joined_at, today)
    const cycleStart = student.last_graded_at ?? student.joined_at
    const gradeMonths = monthsElapsed(current.is_ranked ? student.last_graded_at : student.joined_at, today)
    requirements.push(
      { key: 'membership', actual: student.membership_status, required: 'active', met: student.membership_status === 'active' },
      { key: 'membership-length', actual: membershipMonths, required: 3, met: membershipMonths === null ? null : membershipMonths >= 3 },
    )
    if (spec.min_age_years !== null) {
      const age = student.date_of_birth > today ? null : Number(today.slice(0, 4)) - Number(student.date_of_birth.slice(0, 4))
      requirements.push({ key: 'age', actual: age, required: spec.min_age_years, met: age === null ? null : age >= spec.min_age_years })
    }
    if (spec.min_months > 0 || (student.last_graded_at !== null && student.last_graded_at > today)) requirements.push({ key: 'time', actual: gradeMonths,
      required: spec.max_months === null ? spec.min_months : `${spec.min_months}–${spec.max_months}`,
      met: gradeMonths === null ? null : gradeMonths >= spec.min_months })
    if (spec.min_sessions !== null) {
      const attended = cycleStart <= today && reads.summary.cycleStart === cycleStart ? reads.summary.cycleAttended : null
      requirements.push({ key: 'sessions', actual: attended, required: spec.min_sessions, met: attended === null ? null : attended >= spec.min_sessions })
    }
    requirements.push({ key: 'fees', actual: student.outstanding_fees ? 'outstanding' : 'clear', required: 'clear', met: !student.outstanding_fees })
  }
  const syllabus = target ? reads.reference.syllabusItems.filter(item => item.grade_id === target.id && item.track === track)
    .sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.id.localeCompare(b.id)) : []
  const signOffs = reads.signOffs.filter(entry => entry.signOff.student_id === student.id && syllabus.some(item => item.id === entry.signOff.syllabus_item_id))
  const ready = requirements.length > 0 && requirements.every(requirement => requirement.met === true)
  const status = ready ? 'Ready to start assessment' : requirements.some(requirement => requirement.met === null) || !requirements.length ? 'Readiness unverified' : 'Not ready to start assessment'
  return { track, current, target, spec, requirements, syllabus, signOffs, ready, status }
}

const requirementLabels: Record<ReadinessRequirement['key'], string> = {
  membership: 'Active membership', 'membership-length': 'Time as a member', age: 'Minimum age (by calendar year)',
  time: 'Time in current grade', sessions: 'Training sessions since last grading', fees: 'Fees up to date',
}

export function readinessRequirementText(requirement: ReadinessRequirement, unranked: boolean) {
  const format = (value: ReadinessRequirement['actual']) => {
    if (value === null) return 'Not recorded'
    if (requirement.key === 'membership-length' || requirement.key === 'time') return `${value} ${value === 1 ? 'month' : 'months'}`
    if (requirement.key === 'age') return `${value} ${value === 1 ? 'year' : 'years'}`
    const text = String(value)
    return text.charAt(0).toUpperCase() + text.slice(1)
  }
  return { label: requirement.key === 'time' && unranked ? 'Practice since joining' : requirementLabels[requirement.key],
    actual: format(requirement.actual), required: format(requirement.required) }
}
