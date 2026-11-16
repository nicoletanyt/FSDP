import { collectCalendarPages } from './calendar-queries'
import type { InstructorApi } from './calendar-queries'
import { dateOnly } from './decoders'
import { directoryTrack } from './directory'
import type {
  GradeRow, GradeTrack, InstructorReferenceData, ReadinessRequirement, StudentAttendanceSummary,
  StudentDetail, StudentHistoryEntry, TechniqueProgressEntry, TechniqueStatus,
} from './types'

function monthsElapsed(start: string | null, today: string): number | null {
  if (!start || start > today) return null
  dateOnly(start)
  return (Number(today.slice(0, 4)) - Number(start.slice(0, 4))) * 12
    + Number(today.slice(5, 7)) - Number(start.slice(5, 7)) - Number(today.slice(8) < start.slice(8))
}

/** Grades an adult grading can award short of the full target (adult note 7). */
const INTERMEDIATE_GRADE_IDS = ['green-8th-kyu', 'purple-7th-kyu', 'blue-silver-6th-kyu', 'brown-silver-4th-kyu', 'black-silver-2nd-kyu']

export interface StudentGradingReads {
  reference: InstructorReferenceData
  summary: StudentAttendanceSummary
  progress: TechniqueProgressEntry[]
  assessments: StudentHistoryEntry[]
}

export async function loadStudentGrading(api: InstructorApi, studentId: StudentDetail['student']['id'], signal: AbortSignal): Promise<StudentGradingReads> {
  const [reference, summary, progress, assessments] = await Promise.all([
    api.getReferenceData(signal), api.getStudentSummary(studentId, signal), api.getTechniqueProgress(studentId, signal),
    collectCalendarPages(options => api.getRecordedAssessments(studentId, options), item => `${item.record.event_id}:${item.record.student_id}`, signal),
  ])
  return { reference, summary, progress, assessments }
}

export function studentGrading(detail: StudentDetail, reads: StudentGradingReads, today: string) {
  dateOnly(today)
  const { student } = detail
  const track = directoryTrack(student.date_of_birth, today)
  const current = reads.reference.grades.find(grade => grade.id === student.current_grade_id) ?? null
  const ladderFor = (ladderTrack: GradeTrack) => reads.reference.grades
    .filter(grade => reads.reference.gradeTracks.some(row => row.grade_id === grade.id && row.track === ladderTrack))
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
  const age = student.date_of_birth > today ? null : Number(today.slice(0, 4)) - Number(student.date_of_birth.slice(0, 4))
  const requirementFor = (grade: GradeRow, gradeTrack: GradeTrack) =>
    reads.reference.gradeRequirements.find(row => row.grade_id === grade.id && row.track === gradeTrack) ?? null
  // A grade with a maximum age (Junior Dan: 14 and below) is skipped once the student is older.
  const nextOn = (ladderTrack: GradeTrack) => current ? ladderFor(ladderTrack).find(grade => {
    if (grade.sort_order <= current.sort_order) return false
    const maxAge = requirementFor(grade, ladderTrack)?.max_age_years ?? null
    return maxAge === null || age === null || age <= maxAge
  }) ?? null : null
  // Students grade on the adult sheet from the year they turn 13. A child at the
  // top of the children's ladder (Black-Silver) is shown the next adult grade.
  const ownTarget = track ? nextOn(track) : null
  const crossoverTarget = track === 'children' && !ownTarget ? nextOn('adult') : null
  const target: GradeRow | null = ownTarget ?? crossoverTarget
  const targetTrack: GradeTrack | null = crossoverTarget ? 'adult' : track
  const spec = target && targetTrack ? requirementFor(target, targetTrack) : null
  const requirements: ReadinessRequirement[] = []
  if (spec && current && track) {
    const membershipMonths = monthsElapsed(student.joined_at, today)
    const cycleStart = student.last_graded_at ?? student.joined_at
    const gradeMonths = monthsElapsed(current.is_ranked ? student.last_graded_at : student.joined_at, today)
    requirements.push(
      { key: 'membership', actual: student.membership_status, required: 'active', met: student.membership_status === 'active' },
      { key: 'membership-length', actual: membershipMonths, required: 3, met: membershipMonths === null ? null : membershipMonths >= 3 },
    )
    if (crossoverTarget) {
      requirements.push({ key: 'adult-age', actual: age, required: 13, met: age === null ? null : age >= 13 })
    }
    if (spec.min_age_years !== null) {
      requirements.push({ key: 'age', actual: age, required: spec.min_age_years, met: age === null ? null : age >= spec.min_age_years })
    }
    if (spec.max_age_years !== null) {
      requirements.push({ key: 'max-age', actual: age, required: spec.max_age_years, met: age === null ? null : age <= spec.max_age_years })
    }
    // Adult note 7: an intermediate grade awarded at an adult grading (13+ by year
    // on the last-graded date) submits directly, without the months/sessions minimums.
    const directEntry = track === 'adult' && INTERMEDIATE_GRADE_IDS.includes(student.current_grade_id)
      && student.last_graded_at !== null && student.last_graded_at <= today
      && Number(student.last_graded_at.slice(0, 4)) - Number(student.date_of_birth.slice(0, 4)) >= 13
    if (directEntry && (spec.min_months > 0 || spec.min_sessions !== null)) {
      requirements.push({ key: 'direct-entry', actual: 'submit directly', required: 'submit directly', met: true })
    }
    if (!directEntry && (spec.min_months > 0 || (student.last_graded_at !== null && student.last_graded_at > today))) requirements.push({ key: 'time', actual: gradeMonths,
      required: spec.max_months === null ? spec.min_months : `${spec.min_months}–${spec.max_months}`,
      met: gradeMonths === null ? null : gradeMonths >= spec.min_months })
    if (spec.min_sessions !== null && !directEntry) {
      const attended = cycleStart <= today && reads.summary.cycleStart === cycleStart ? reads.summary.cycleAttended : null
      requirements.push({ key: 'sessions', actual: attended, required: spec.min_sessions, met: attended === null ? null : attended >= spec.min_sessions })
    }
    requirements.push({ key: 'fees', actual: student.outstanding_fees ? 'outstanding' : 'clear', required: 'clear', met: !student.outstanding_fees })
  }
  const syllabus = target ? reads.reference.syllabusItems.filter(item => item.grade_id === target.id && item.track === targetTrack)
    .sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.id.localeCompare(b.id)) : []
  const syllabusIds = new Set(syllabus.map(item => item.id))
  const progress = reads.progress.filter(entry => entry.progress.student_id === student.id && syllabusIds.has(entry.progress.syllabus_item_id))
  const ready = requirements.length > 0 && requirements.every(requirement => requirement.met === true)
  const status = ready ? 'Ready to start assessment' : requirements.some(requirement => requirement.met === null) || !requirements.length ? 'Readiness unverified' : 'Not ready to start assessment'
  return { track, targetTrack, current, target, spec, requirements, syllabus, progress, progressSummary: progressSummary(syllabus.length, progress), ready, status }
}

export const TECHNIQUE_STATUSES: readonly TechniqueStatus[] = ['not_assessed', 'introduced', 'developing', 'consistent']

export const techniqueStatusLabels: Record<TechniqueStatus, string> = {
  not_assessed: 'Not assessed', introduced: 'Introduced', developing: 'Developing', consistent: 'Consistent',
}

export function techniqueStatus(entry: TechniqueProgressEntry | undefined): TechniqueStatus {
  return entry?.progress.status ?? 'not_assessed'
}

/** Status counts for the target-grade syllabus and the most recent update. */
export function progressSummary(total: number, progress: TechniqueProgressEntry[]) {
  const counts: Record<TechniqueStatus, number> = { not_assessed: total, introduced: 0, developing: 0, consistent: 0 }
  let latest: TechniqueProgressEntry | null = null
  for (const entry of progress) {
    const status = techniqueStatus(entry)
    if (status !== 'not_assessed') { counts[status] += 1; counts.not_assessed -= 1 }
    if (!latest || Date.parse(entry.progress.updated_at) > Date.parse(latest.progress.updated_at)) latest = entry
  }
  return { total, counts, latest }
}

const requirementLabels: Record<ReadinessRequirement['key'], string> = {
  membership: 'Active membership', 'membership-length': 'Time as a member', 'adult-age': 'Adult grading age (by calendar year)', age: 'Minimum age (by calendar year)', 'max-age': 'Maximum age (by calendar year)',
  'direct-entry': 'Intermediate grade from last adult grading', time: 'Time in current grade', sessions: 'Training sessions since last grading', fees: 'Fees up to date',
}

export function readinessRequirementText(requirement: ReadinessRequirement, unranked: boolean) {
  const format = (value: ReadinessRequirement['actual']) => {
    if (value === null) return 'Not recorded'
    if (requirement.key === 'membership-length' || requirement.key === 'time') return `${value} ${value === 1 ? 'month' : 'months'}`
    if (requirement.key === 'age' || requirement.key === 'max-age' || requirement.key === 'adult-age') return `${value} ${value === 1 ? 'year' : 'years'}`
    const text = String(value)
    return text.charAt(0).toUpperCase() + text.slice(1)
  }
  return { label: requirement.key === 'time' && unranked ? 'Practice since joining' : requirementLabels[requirement.key],
    actual: format(requirement.actual), required: format(requirement.required) }
}
