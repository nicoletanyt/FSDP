import {
  daysAgoIso,
  formatShortDate,
  todayIso,
} from './format'
import type {
  AttendanceRecord,
  AttendanceStats,
  RiskAssessment,
  RiskLevel,
  Session,
  Student,
  WeeklyTrendPoint,
} from './types'

function sessionMap(sessions: Session[]) {
  return new Map(sessions.map((session) => [session.id, session]))
}

function statsBetween(
  records: AttendanceRecord[],
  sessionsById: Map<string, Session>,
  studentId: string,
  startIso: string,
  endIso: string,
): AttendanceStats {
  let attended = 0
  let absences = 0

  for (const record of records) {
    if (record.studentId !== studentId) continue
    const session = sessionsById.get(record.sessionId)
    if (!session) continue
    if (session.date < startIso || session.date > endIso) continue
    if (record.status === 'present' || record.status === 'late') attended++
    else if (record.status === 'absent') absences++
  }

  const total = attended + absences
  return {
    attended,
    absences,
    total,
    rate: total === 0 ? 0 : (attended / total) * 100,
  }
}

export function getAttendanceStats(
  records: AttendanceRecord[],
  sessions: Session[],
  studentId: string,
  days: number,
  referenceIso = todayIso(),
): AttendanceStats {
  const sessionsById = sessionMap(sessions)
  const startIso = days <= 1 ? referenceIso : daysAgoIso(days - 1)
  return statsBetween(records, sessionsById, studentId, startIso, referenceIso)
}

export function getStudentWeeklyTrend(
  records: AttendanceRecord[],
  sessions: Session[],
  studentId: string,
  weeks = 8,
): WeeklyTrendPoint[] {
  const sessionsById = sessionMap(sessions)
  const points: WeeklyTrendPoint[] = []

  for (let week = weeks - 1; week >= 0; week--) {
    const startIso = daysAgoIso(week * 7 + 6)
    const endIso = daysAgoIso(week * 7)
    const stats = statsBetween(records, sessionsById, studentId, startIso, endIso)
    points.push({
      label: formatShortDate(startIso),
      rate: Math.round(stats.rate),
      sessions: 0,
    })
  }

  return points
}

function lastAttendedDate(
  records: AttendanceRecord[],
  sessionsById: Map<string, Session>,
  studentId: string,
): string | null {
  let latest: string | null = null

  for (const record of records) {
    if (record.studentId !== studentId) continue
    if (record.status !== 'present' && record.status !== 'late') continue
    const session = sessionsById.get(record.sessionId)
    if (!session) continue
    if (!latest || session.date > latest) latest = session.date
  }

  return latest
}

function consecutiveAbsences(
  records: AttendanceRecord[],
  sessionsById: Map<string, Session>,
  studentId: string,
): number {
  const entries = records
    .filter((record) => record.studentId === studentId)
    .map((record) => ({ record, session: sessionsById.get(record.sessionId) }))
    .filter((entry): entry is { record: AttendanceRecord; session: Session } =>
      Boolean(entry.session),
    )
    .sort((left, right) =>
      `${right.session.date}T${right.session.startTime}`.localeCompare(
        `${left.session.date}T${left.session.startTime}`,
      ),
    )

  let streak = 0
  for (const entry of entries) {
    if (entry.record.status === 'present' || entry.record.status === 'late') break
    if (entry.record.status === 'excused') continue
    streak++
  }

  return streak
}

function riskLevelFor(
  rate30: number,
  change: number,
  consecutive: number,
  hasReasons: boolean,
): RiskLevel {
  if (rate30 < 50 || consecutive >= 5) return 'critical'
  if (hasReasons) return 'at_risk'
  if (rate30 < 80 || change <= -10) return 'watch'
  return 'healthy'
}

export function getRiskAssessment(
  student: Student,
  records: AttendanceRecord[],
  sessions: Session[],
): RiskAssessment {
  const sessionsById = sessionMap(sessions)
  const current = getAttendanceStats(records, sessions, student.id, 30)
  const previousStart = daysAgoIso(59)
  const previousEnd = daysAgoIso(30)
  const previous = statsBetween(records, sessionsById, student.id, previousStart, previousEnd)
  const change = current.rate - previous.rate
  const absenceStreak = consecutiveAbsences(records, sessionsById, student.id)

  const reasons: string[] = []
  if (current.rate < 70) {
    reasons.push(`30-day attendance is ${Math.round(current.rate)}% (below 70%)`)
  }
  if (change <= -15) {
    reasons.push(
      `Attendance fell ${Math.abs(Math.round(change))} points vs the previous 30 days`,
    )
  }
  if (absenceStreak >= 3) {
    reasons.push(`${absenceStreak} consecutive absences`)
  }

  return {
    studentId: student.id,
    level: riskLevelFor(current.rate, change, absenceStreak, reasons.length > 0),
    reasons,
    rate30: current.rate,
    previousRate: previous.rate,
    change,
    consecutiveAbsences: absenceStreak,
    lastAttended: lastAttendedDate(records, sessionsById, student.id),
    weeklyRates: getStudentWeeklyTrend(records, sessions, student.id).map(
      (point) => point.rate,
    ),
  }
}

const riskOrder: Record<RiskLevel, number> = {
  critical: 0,
  at_risk: 1,
  watch: 2,
  healthy: 3,
}

export function getRiskAssessments(
  students: Student[],
  records: AttendanceRecord[],
  sessions: Session[],
): RiskAssessment[] {
  return students
    .map((student) => getRiskAssessment(student, records, sessions))
    .sort((left, right) => {
      const severity = riskOrder[left.level] - riskOrder[right.level]
      return severity === 0 ? left.rate30 - right.rate30 : severity
    })
}

export function getDecliningAssessments(
  students: Student[],
  records: AttendanceRecord[],
  sessions: Session[],
): RiskAssessment[] {
  return getRiskAssessments(students, records, sessions).filter(
    (assessment) =>
      assessment.level === 'at_risk' || assessment.level === 'critical',
  )
}

export function getWeeklyAttendanceTrend(
  records: AttendanceRecord[],
  sessions: Session[],
  centreId = 'all',
  weeks = 8,
): WeeklyTrendPoint[] {
  const points: WeeklyTrendPoint[] = []
  const today = todayIso()

  for (let week = weeks - 1; week >= 0; week--) {
    const startIso = daysAgoIso(week * 7 + 6)
    const endIso = daysAgoIso(week * 7)
    const weekSessions = sessions.filter(
      (session) =>
        session.date >= startIso &&
        session.date <= endIso &&
        session.date <= today &&
        (centreId === 'all' || session.centreId === centreId),
    )
    const sessionIds = new Set(weekSessions.map((session) => session.id))

    let attended = 0
    let absences = 0
    for (const record of records) {
      if (!sessionIds.has(record.sessionId)) continue
      if (record.status === 'present' || record.status === 'late') attended++
      else if (record.status === 'absent') absences++
    }

    const total = attended + absences
    points.push({
      label: formatShortDate(startIso),
      rate: total === 0 ? 0 : Math.round((attended / total) * 100),
      sessions: weekSessions.length,
    })
  }

  return points
}

export function getOverallAttendanceRate(
  records: AttendanceRecord[],
  sessions: Session[],
  centreId = 'all',
  days = 30,
): number {
  const sessionsById = sessionMap(sessions)
  const startIso = daysAgoIso(days - 1)
  let attended = 0
  let absences = 0

  for (const record of records) {
    const session = sessionsById.get(record.sessionId)
    if (!session) continue
    if (session.date < startIso || session.date > todayIso()) continue
    if (centreId !== 'all' && session.centreId !== centreId) continue
    if (record.status === 'present' || record.status === 'late') attended++
    else if (record.status === 'absent') absences++
  }

  const total = attended + absences
  return total === 0 ? 0 : (attended / total) * 100
}

export function getStudentHistory(
  records: AttendanceRecord[],
  sessions: Session[],
  studentId: string,
) {
  const sessionsById = sessionMap(sessions)
  return records
    .filter((record) => record.studentId === studentId)
    .map((record) => ({ record, session: sessionsById.get(record.sessionId) }))
    .filter((entry): entry is { record: AttendanceRecord; session: Session } =>
      Boolean(entry.session),
    )
    .sort((left, right) =>
      `${right.session.date}T${right.session.startTime}`.localeCompare(
        `${left.session.date}T${left.session.startTime}`,
      ),
    )
}
