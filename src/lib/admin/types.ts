export const grades = [
  '6th Kyu',
  '5th Kyu',
  '4th Kyu',
  '3rd Kyu',
  '2nd Kyu',
  '1st Kyu',
  'Shodan',
  'Nidan',
] as const

export type Grade = typeof grades[number]

const nextGrades: Record<Grade, Grade | null> = {
  '6th Kyu': '5th Kyu',
  '5th Kyu': '4th Kyu',
  '4th Kyu': '3rd Kyu',
  '3rd Kyu': '2nd Kyu',
  '2nd Kyu': '1st Kyu',
  '1st Kyu': 'Shodan',
  Shodan: 'Nidan',
  Nidan: null,
}

export function nextGrade(grade: Grade): Grade | null {
  return nextGrades[grade]
}

export type MembershipStatus = 'active' | 'expired' | 'pending'
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'
export type RiskLevel = 'healthy' | 'watch' | 'at_risk' | 'critical'
export type FollowUpStatus = 'none' | 'flagged' | 'contacted' | 'resolved'
export type ApplicationStatus = 'submitted' | 'under_review' | 'withdrawn'
export type SessionType = 'regular' | 'weapons' | 'kids' | 'seminar' | 'external'
export type EligibilityStatus = 'eligible' | 'almost' | 'not_eligible'
export type NotificationChannel = 'email' | 'in_app'
export type NotificationTemplate =
  | 'Grading invitation'
  | 'Attendance concern'
  | 'General reminder'

export interface Centre {
  id: string
  name: string
  shortName: string
  address: string
  timezone: string
}

export interface Instructor {
  id: string
  firstName: string
  lastName: string
  email: string
  centreIds: string[]
}

export interface Student {
  id: string
  memberNo: string
  firstName: string
  lastName: string
  email: string
  phone: string
  homeCentreId: string
  currentGrade: Grade
  membershipStatus: MembershipStatus
  joinedAt: string
  lastGradedAt: string | null
  followUpStatus: FollowUpStatus
  outstandingFees: boolean
}

export interface Session {
  id: string
  centreId: string
  instructorId: string
  title: string
  date: string
  startTime: string
  durationMinutes: number
  type: SessionType
  isExternal: boolean
  externalLocation?: string
}

export interface AttendanceRecord {
  id: string
  sessionId: string
  studentId: string
  status: AttendanceStatus
  recordedAt: string
  recordedBy: string
}

export interface GradingOpportunity {
  id: string
  title: string
  centreId: string
  instructorId: string
  date: string
  applicationDeadline: string
  targetGrades: Grade[]
  status: 'draft' | 'open' | 'closed'
}

export interface GradingApplication {
  id: string
  studentId: string
  opportunityId: string
  targetGrade: Grade
  submittedAt: string
  status: ApplicationStatus
  notes?: string
}

export interface NotificationEntry {
  id: string
  channel: NotificationChannel
  template: NotificationTemplate
  audience: string
  recipientCount: number
  sentAt: string
  deliveredCount: number
  failedCount: number
}

export interface NewSessionInput {
  centreId: string
  instructorId: string
  title: string
  date: string
  startTime: string
  durationMinutes: number
  type: SessionType
  isExternal: boolean
  externalLocation?: string
}

export interface NewOpportunityInput {
  title: string
  centreId: string
  instructorId: string
  date: string
  applicationDeadline: string
  targetGrades: Grade[]
}

export interface NewNotificationInput {
  channel: NotificationChannel
  template: NotificationTemplate
  audience: string
  recipientCount: number
}

export interface AttendanceStats {
  rate: number
  attended: number
  absences: number
  total: number
}

export interface RiskAssessment {
  studentId: string
  level: RiskLevel
  reasons: string[]
  rate30: number
  previousRate: number
  change: number
  consecutiveAbsences: number
  lastAttended: string | null
  weeklyRates: number[]
}

export interface EligibilityRequirement {
  key: string
  label: string
  actual: string
  required: string
  met: boolean
}

export interface EligibilityAssessment {
  studentId: string
  targetGrade: Grade
  requirements: EligibilityRequirement[]
  metCount: number
  total: number
  status: EligibilityStatus
}

export interface CentreStats {
  centreId: string
  studentCount: number
  activeCount: number
  attendanceRate: number
  decliningCount: number
  eligibleCount: number
}

export interface WeeklyTrendPoint {
  label: string
  rate: number
  sessions: number
}
