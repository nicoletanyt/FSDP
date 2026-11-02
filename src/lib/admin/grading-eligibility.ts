import { monthsBetween, titleCase, todayIso, yearAgeFromIso } from './format'
import { getGradeSyllabusItems } from './syllabus'
import { UNRANKED, gradeTrackForAge, nextGrade } from './types'
import type {
  AttendanceRecord,
  EligibilityAssessment,
  EligibilityRequirement,
  EligibilityStatus,
  Grade,
  RankedGrade,
  Session,
  Student,
  TechniqueSignOff,
} from './types'

export interface GradeRequirement {
  /** Minimum time in the previous grade before applying for this one. */
  minMonths: number
  /** Upper bound when the published rule is a range (e.g. 4–6 months). */
  maxMonths?: number
  /** Minimum training sessions since the last grading, where published. */
  sessions?: number
  /** Minimum age (calendar-year, "by year"), where published. */
  minAge?: number
}

/**
 * Published ASK grading requirements. Every value is a minimum measured from
 * the previous grading (not cumulative). Children start unranked and the
 * months against 12th Kyu count from joining.
 *
 * Children's values come from the two children's sheets; adult values from the
 * adult sheet (revised January 2021). The adult sheet prints a minimum age on
 * the 1st Dan and 4th Dan lines and gates 2nd Kyu at 12.
 */
export const gradingRequirements: Record<RankedGrade, GradeRequirement> = {
  // Children's grading — 12th Kyu (Red) to 2nd Kyu (Black-Silver)
  'Red (12th Kyu)': { minMonths: 3, minAge: 5 },
  'Red-Gold (11th Kyu)': { minMonths: 4 },
  'Yellow (10th Kyu)': { minMonths: 4 },
  'Orange (9th Kyu)': { minMonths: 4 },
  'Green (8th Kyu)': { minMonths: 4, maxMonths: 6 },
  'Purple (7th Kyu)': { minMonths: 6 },
  'Blue (6th Kyu)': { minMonths: 6 },
  'Blue-Silver (6th Kyu)': { minMonths: 6 },
  'Blue-Gold (5th Kyu)': { minMonths: 6 },
  'Brown (4th Kyu)': { minMonths: 10 },
  'Brown-Silver (4th Kyu)': { minMonths: 10 },
  'Brown-Gold (3rd Kyu)': { minMonths: 8, maxMonths: 10 },
  'Black (2nd Kyu)': { minMonths: 10, minAge: 12 },
  'Black-Silver (2nd Kyu)': { minMonths: 10 },

  // Adult grading — Blue (6th Kyu) to 4th Dan
  'Black-Gold (1st Kyu)': { minMonths: 9, sessions: 62 },
  'Junior Dan': { minMonths: 9, sessions: 62 },
  '1st Dan': { minMonths: 9, sessions: 70, minAge: 15 },
  '2nd Dan': { minMonths: 18, sessions: 150 },
  '3rd Dan': { minMonths: 30, sessions: 240 },
  '4th Dan': { minMonths: 42, sessions: 400, minAge: 26 },
}

// Adult months/sessions on the adult sheet. Children share the Blue/Brown/Black
// keys, so the rule above keeps the children's months and the adult sheet's
// session minimums are applied by track below.
const adultRequirements: Partial<Record<RankedGrade, GradeRequirement>> = {
  'Blue (6th Kyu)': { minMonths: 3, sessions: 20 },
  'Blue-Gold (5th Kyu)': { minMonths: 0, sessions: 24 },
  'Brown (4th Kyu)': { minMonths: 0, sessions: 32 },
  'Brown-Gold (3rd Kyu)': { minMonths: 6, sessions: 36 },
  'Black (2nd Kyu)': { minMonths: 6, sessions: 56, minAge: 12 },
}

const MEMBERSHIP_MONTHS = 3

export function getGradeRequirement(
  grade: Grade,
  track?: 'children' | 'adult',
): GradeRequirement | null {
  if (grade === UNRANKED) return null
  if (track === 'adult' && adultRequirements[grade]) {
    return adultRequirements[grade]
  }
  return gradingRequirements[grade]
}

export function formatMonths(months: number, maxMonths?: number): string {
  const format = (value: number) => `${value} ${value === 1 ? 'month' : 'months'}`
  return maxMonths === undefined ? format(months) : `${months}–${maxMonths} months`
}

export function studentAge(student: Pick<Student, 'dateOfBirth'>): number {
  return yearAgeFromIso(student.dateOfBirth)
}

export function studentTrack(student: Pick<Student, 'dateOfBirth'>) {
  return gradeTrackForAge(studentAge(student))
}

export function evaluateEligibility(
  student: Student,
  targetGrade: Grade | null,
  records: AttendanceRecord[],
  sessions: Session[],
  signOffs: TechniqueSignOff[],
): EligibilityAssessment {
  const track = studentTrack(student)
  const age = studentAge(student)
  const grade = targetGrade ?? nextGrade(student.currentGrade, track, age)
  if (!grade) {
    return {
      studentId: student.id,
      targetGrade: student.currentGrade,
      requirements: [
        {
          key: 'terminal',
          label: 'Next grade',
          actual: 'Highest grade reached',
          required: '—',
          met: false,
        },
      ],
      metCount: 0,
      total: 1,
      status: 'not_eligible',
    }
  }
  const spec = getGradeRequirement(grade, track)
  const sessionsById = new Map(sessions.map((session) => [session.id, session]))
  const gradeStart = student.lastGradedAt ?? student.joinedAt
  const months = monthsBetween(gradeStart)
  const membershipMonths = monthsBetween(student.joinedAt)

  let sessionsSinceGrading = 0
  for (const record of records) {
    if (record.studentId !== student.id) continue
    if (record.status !== 'present' && record.status !== 'late') continue
    const session = sessionsById.get(record.sessionId)
    if (session && session.date >= gradeStart && session.date <= todayIso()) {
      sessionsSinceGrading++
    }
  }

  const requirements: EligibilityRequirement[] = [
    {
      key: 'membership',
      label: 'Active membership',
      actual: titleCase(student.membershipStatus),
      required: 'Active',
      met: student.membershipStatus === 'active',
    },
    {
      key: 'membership-length',
      label: 'Time as a member',
      actual: formatMonths(membershipMonths),
      required: formatMonths(MEMBERSHIP_MONTHS),
      met: membershipMonths >= MEMBERSHIP_MONTHS,
    },
  ]

  if (spec) {
    if (spec.minAge !== undefined) {
      requirements.push({
        key: 'age',
        label: 'Minimum age',
        actual: `${age} ${age === 1 ? 'year' : 'years'}`,
        required: `${spec.minAge} years`,
        met: age >= spec.minAge,
      })
    }

    if (spec.minMonths > 0) {
      requirements.push({
        key: 'time',
        label:
          student.currentGrade === UNRANKED
            ? 'Practice since joining'
            : 'Time in current grade',
        actual: formatMonths(months),
        required: formatMonths(spec.minMonths, spec.maxMonths),
        met: months >= spec.minMonths,
      })
    }

    if (spec.sessions !== undefined) {
      requirements.push({
        key: 'sessions',
        label: 'Training sessions since last grading',
        actual: `${sessionsSinceGrading}`,
        required: `${spec.sessions}`,
        met: sessionsSinceGrading >= spec.sessions,
      })
    }
  }

  // The club's rule: a student must have every technique in the target
  // grade's syllabus row signed off before they can be invited. Earlier rows
  // stay on record but are not re-checked.
  const syllabus = getGradeSyllabusItems(grade, track)
  if (syllabus.length > 0) {
    const signed = new Set(
      signOffs
        .filter((signOff) => signOff.studentId === student.id)
        .map((signOff) => signOff.itemId),
    )
    const signedCount = syllabus.filter((item) => signed.has(item.id)).length
    requirements.push({
      key: 'techniques',
      label: 'Target-grade techniques signed off',
      actual: `${signedCount}`,
      required: `${syllabus.length}`,
      met: signedCount === syllabus.length,
    })
  }

  requirements.push({
    key: 'fees',
    label: 'Fees up to date',
    actual: student.outstandingFees ? 'Outstanding' : 'Clear',
    required: 'Clear',
    met: !student.outstandingFees,
  })

  const metCount = requirements.filter((requirement) => requirement.met).length
  const status: EligibilityStatus =
    metCount === requirements.length
      ? 'eligible'
      : requirements.length - metCount === 1
        ? 'almost'
        : 'not_eligible'

  return {
    studentId: student.id,
    targetGrade: grade,
    requirements,
    metCount,
    total: requirements.length,
    status,
  }
}

export function getEligibilityAssessments(
  students: Student[],
  records: AttendanceRecord[],
  sessions: Session[],
  signOffs: TechniqueSignOff[],
): EligibilityAssessment[] {
  const order: Record<EligibilityStatus, number> = {
    eligible: 0,
    almost: 1,
    not_eligible: 2,
  }

  return students
    .filter(
      (student) =>
        nextGrade(
          student.currentGrade,
          studentTrack(student),
          studentAge(student),
        ) !== null,
    )
    .map((student) =>
      evaluateEligibility(
        student,
        nextGrade(
          student.currentGrade,
          studentTrack(student),
          studentAge(student),
        ),
        records,
        sessions,
        signOffs,
      ),
    )
    .sort((left, right) => {
      const status = order[left.status] - order[right.status]
      return status === 0 ? right.metCount - left.metCount : status
    })
}

export function getEligibilityForStudent(
  student: Student,
  records: AttendanceRecord[],
  sessions: Session[],
  signOffs: TechniqueSignOff[],
) {
  return evaluateEligibility(
    student,
    nextGrade(
      student.currentGrade,
      studentTrack(student),
      studentAge(student),
    ),
    records,
    sessions,
    signOffs,
  )
}

export function countEligible(
  students: Student[],
  records: AttendanceRecord[],
  sessions: Session[],
  signOffs: TechniqueSignOff[],
) {
  return getEligibilityAssessments(students, records, sessions, signOffs).filter(
    (assessment) => assessment.status === 'eligible',
  ).length
}

export function countEligibleForOpportunity(
  students: Student[],
  records: AttendanceRecord[],
  sessions: Session[],
  centreId: string,
  targetGrades: Grade[],
  signOffs: TechniqueSignOff[],
) {
  return students.filter((student) => {
    if (student.homeCentreId !== centreId) return false
    const target = nextGrade(
      student.currentGrade,
      studentTrack(student),
      studentAge(student),
    )
    if (!target || !targetGrades.includes(target)) return false
    return (
      evaluateEligibility(student, target, records, sessions, signOffs)
        .status === 'eligible'
    )
  }).length
}
