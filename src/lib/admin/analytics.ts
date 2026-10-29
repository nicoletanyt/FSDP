import { getDecliningAssessments, getOverallAttendanceRate } from './attendance-risk'
import { getEligibilityAssessments } from './grading-eligibility'
import { todayIso } from './format'
import type {
  AttendanceRecord,
  Centre,
  CentreStats,
  Session,
  Student,
} from './types'

export function getCentreStats(
  centres: Centre[],
  students: Student[],
  records: AttendanceRecord[],
  sessions: Session[],
): CentreStats[] {
  return centres
    .map((centre) => {
      const centreStudents = students.filter(
        (student) => student.homeCentreId === centre.id,
      )
      const declining = getDecliningAssessments(centreStudents, records, sessions)
      const eligible = getEligibilityAssessments(centreStudents, records, sessions).filter(
        (assessment) => assessment.status === 'eligible',
      )

      return {
        centreId: centre.id,
        studentCount: centreStudents.length,
        activeCount: centreStudents.filter(
          (student) => student.membershipStatus === 'active',
        ).length,
        attendanceRate: getOverallAttendanceRate(records, sessions, centre.id, 30),
        decliningCount: declining.length,
        eligibleCount: eligible.length,
      }
    })
    .sort((left, right) => left.attendanceRate - right.attendanceRate)
}

export function getUpcomingSessions(
  sessions: Session[],
  centreId = 'all',
  limit = 5,
): Session[] {
  const today = todayIso()
  return sessions
    .filter(
      (session) =>
        session.date >= today && (centreId === 'all' || session.centreId === centreId),
    )
    .sort((left, right) =>
      `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`),
    )
    .slice(0, limit)
}

export function getRecentSessions(
  sessions: Session[],
  centreId = 'all',
  limit = 20,
): Session[] {
  const today = todayIso()
  return sessions
    .filter(
      (session) =>
        session.date <= today && (centreId === 'all' || session.centreId === centreId),
    )
    .sort((left, right) =>
      `${right.date}T${right.startTime}`.localeCompare(`${left.date}T${left.startTime}`),
    )
    .slice(0, limit)
}

export function getSessionRoster(students: Student[], session: Session): Student[] {
  return students
    .filter((student) => student.homeCentreId === session.centreId)
    .sort((left, right) => left.firstName.localeCompare(right.firstName))
}

export function getSessionAttendanceSummary(
  records: AttendanceRecord[],
  sessionId: string,
) {
  const sessionRecords = records.filter((record) => record.sessionId === sessionId)
  return {
    total: sessionRecords.length,
    present: sessionRecords.filter((record) => record.status === 'present').length,
    late: sessionRecords.filter((record) => record.status === 'late').length,
    absent: sessionRecords.filter((record) => record.status === 'absent').length,
    excused: sessionRecords.filter((record) => record.status === 'excused').length,
  }
}
