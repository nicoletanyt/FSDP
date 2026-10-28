import { getAttendanceStats } from './attendance-risk'
import { monthsBetween, titleCase, todayIso } from './format'
import { nextGrade } from './types'
import type {
  AttendanceRecord,
  EligibilityAssessment,
  EligibilityRequirement,
  EligibilityStatus,
  Grade,
  Session,
  Student,
} from './types'

const attendanceRequired = 75

export function evaluateEligibility(
  student: Student,
  targetGrade: Grade | null,
  records: AttendanceRecord[],
  sessions: Session[],
): EligibilityAssessment {
  const grade = targetGrade ?? nextGrade(student.currentGrade) ?? student.currentGrade
  const sessionsById = new Map(sessions.map((session) => [session.id, session]))
  const gradeStart = student.lastGradedAt ?? student.joinedAt
  const attendance90 = getAttendanceStats(records, sessions, student.id, 90)
  const months = monthsBetween(student.lastGradedAt ?? student.joinedAt)

  let sessionsSinceGrading = 0
  for (const record of records) {
    if (record.studentId !== student.id) continue
    if (record.status !== 'present' && record.status !== 'late') continue
    const session = sessionsById.get(record.sessionId)
    if (session && session.date >= gradeStart && session.date <= todayIso()) {
      sessionsSinceGrading++
    }
  }

  const sessionsRequired = grade === 'Shodan' || grade === 'Nidan' ? 30 : 20
  const monthsRequired = grade === 'Shodan' || grade === 'Nidan' ? 6 : 4

  const requirements: EligibilityRequirement[] = [
    {
      key: 'membership',
      label: 'Active membership',
      actual: titleCase(student.membershipStatus),
      required: 'Active',
      met: student.membershipStatus === 'active',
    },
    {
      key: 'sessions',
      label: 'Training sessions since last grading',
      actual: `${sessionsSinceGrading}`,
      required: `${sessionsRequired}`,
      met: sessionsSinceGrading >= sessionsRequired,
    },
    {
      key: 'attendance',
      label: 'Attendance over the last 90 days',
      actual: `${Math.round(attendance90.rate)}%`,
      required: `${attendanceRequired}%`,
      met: attendance90.rate >= attendanceRequired,
    },
    {
      key: 'time',
      label: 'Time in current grade',
      actual: `${months} ${months === 1 ? 'month' : 'months'}`,
      required: `${monthsRequired} months`,
      met: months >= monthsRequired,
    },
    {
      key: 'fees',
      label: 'Fees up to date',
      actual: student.outstandingFees ? 'Outstanding' : 'Clear',
      required: 'Clear',
      met: !student.outstandingFees,
    },
  ]

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
    .map((student) => evaluateEligibility(student, nextGrade(student.currentGrade), records, sessions))
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
  return evaluateEligibility(student, nextGrade(student.currentGrade), records, sessions)
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
    const target = nextGrade(student.currentGrade)
    if (!target || !targetGrades.includes(target)) return false
    return evaluateEligibility(student, target, records, sessions).status === 'eligible'
  }).length
}
