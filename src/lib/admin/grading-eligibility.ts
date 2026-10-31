import { ageFromIso, monthsBetween, titleCase, todayIso } from './format'
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
} from './types'

export interface GradeRequirement {
  /** Minimum time in the previous grade before applying for this one. */
  minMonths: number
  /** Upper bound when the published rule is a range (e.g. 4–6 months). */
  maxMonths?: number
  /** Minimum training sessions since the last grading, where published. */
  sessions?: number
  /** Minimum age, used for the children's entry rank. */
  minAge?: number
}

/**
 * Published ASK grading requirements. Every value is a minimum measured from
 * the previous grading (not cumulative). Children start unranked and the
 * months against 12th Kyu count from joining.
 */
export const gradingRequirements: Record<RankedGrade, GradeRequirement> = {
  // Children's grading
  '12th Kyu (Red)': { minMonths: 3, minAge: 5 },
  '11th Kyu (Red-Gold)': { minMonths: 4 },
  '10th Kyu (Yellow)': { minMonths: 4 },
  '9th Kyu (Orange)': { minMonths: 4 },
  '8th Kyu (Green)': { minMonths: 4, maxMonths: 6 },
  '7th Kyu (Purple)': { minMonths: 6 },
  '6th Kyu (Blue)': { minMonths: 6 },
  '6th Kyu (Blue-Silver)': { minMonths: 6 },
  '5th Kyu (Blue-Gold)': { minMonths: 6 },
  '4th Kyu (Brown)': { minMonths: 10 },
  '4th Kyu (Brown-Silver)': { minMonths: 10 },
  '3rd Kyu (Brown-Silver)': { minMonths: 8, maxMonths: 10 },
  '2nd Kyu (Black)': { minMonths: 10 },
  '2nd Kyu (Black-Silver)': { minMonths: 10 },
  '1st Kyu (Black-Gold)': { minMonths: 9, sessions: 62 },
  'Junior Dan': { minMonths: 9, sessions: 62 },

  // Adult grading
  '6th Kyu': { minMonths: 3, sessions: 20 },
  '5th Kyu': { minMonths: 0, sessions: 24 },
  '4th Kyu': { minMonths: 0, sessions: 32 },
  '3rd Kyu': { minMonths: 6, sessions: 36 },
  '2nd Kyu': { minMonths: 6, sessions: 56 },
  '1st Kyu': { minMonths: 9, sessions: 62 },
  Shodan: { minMonths: 9, sessions: 70 },
  Nidan: { minMonths: 18, sessions: 150 },
  '3rd Dan': { minMonths: 30, sessions: 240 },
  '4th Dan': { minMonths: 42, sessions: 400 },
}

const MEMBERSHIP_MONTHS = 3

export function getGradeRequirement(grade: Grade): GradeRequirement | null {
  return grade === UNRANKED ? null : gradingRequirements[grade]
}

export function formatMonths(months: number, maxMonths?: number): string {
  const format = (value: number) => `${value} ${value === 1 ? 'month' : 'months'}`
  return maxMonths === undefined ? format(months) : `${months}–${maxMonths} months`
}

export function studentTrack(student: Pick<Student, 'dateOfBirth'>) {
  return gradeTrackForAge(ageFromIso(student.dateOfBirth))
}

export function evaluateEligibility(
  student: Student,
  targetGrade: Grade | null,
  records: AttendanceRecord[],
  sessions: Session[],
): EligibilityAssessment {
  const track = studentTrack(student)
  const grade = targetGrade ?? nextGrade(student.currentGrade, track)
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
  const spec = getGradeRequirement(grade)
  const sessionsById = new Map(sessions.map((session) => [session.id, session]))
  const gradeStart = student.lastGradedAt ?? student.joinedAt
  const months = monthsBetween(gradeStart)
  const membershipMonths = monthsBetween(student.joinedAt)
  const age = ageFromIso(student.dateOfBirth)

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
): EligibilityAssessment[] {
  const order: Record<EligibilityStatus, number> = {
    eligible: 0,
    almost: 1,
    not_eligible: 2,
  }

  return students
    .filter(
      (student) => nextGrade(student.currentGrade, studentTrack(student)) !== null,
    )
    .map((student) =>
      evaluateEligibility(
        student,
        nextGrade(student.currentGrade, studentTrack(student)),
        records,
        sessions,
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
) {
  return evaluateEligibility(
    student,
    nextGrade(student.currentGrade, studentTrack(student)),
    records,
    sessions,
  )
}

export function countEligible(
  students: Student[],
  records: AttendanceRecord[],
  sessions: Session[],
) {
  return getEligibilityAssessments(students, records, sessions).filter(
    (assessment) => assessment.status === 'eligible',
  ).length
}

export function countEligibleForOpportunity(
  students: Student[],
  records: AttendanceRecord[],
  sessions: Session[],
  centreId: string,
  targetGrades: Grade[],
) {
  return students.filter((student) => {
    if (student.homeCentreId !== centreId) return false
    const target = nextGrade(student.currentGrade, studentTrack(student))
    if (!target || !targetGrades.includes(target)) return false
    return evaluateEligibility(student, target, records, sessions).status === 'eligible'
  }).length
}
