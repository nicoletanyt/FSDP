export type GradeTrack = 'children' | 'adult'

export const UNRANKED = 'Unranked' as const

/**
 * Ranked grades. Children's and adult ladders overlap by kyu number, so labels
 * carry a colour suffix where needed to stay unique (Kyu 6 Blue vs Kyu 6
 * Blue-Silver).
 */
export const grades = [
  // Adult ladder
  '6th Kyu',
  '5th Kyu',
  '4th Kyu',
  '3rd Kyu',
  '2nd Kyu',
  '1st Kyu',
  'Shodan',
  'Nidan',
  '3rd Dan',
  '4th Dan',
  // Children's ladder
  '12th Kyu (Red)',
  '11th Kyu (Red-Gold)',
  '10th Kyu (Yellow)',
  '9th Kyu (Orange)',
  '8th Kyu (Green)',
  '7th Kyu (Purple)',
  '6th Kyu (Blue)',
  '6th Kyu (Blue-Silver)',
  '5th Kyu (Blue-Gold)',
  '4th Kyu (Brown)',
  '4th Kyu (Brown-Silver)',
  '3rd Kyu (Brown-Silver)',
  '2nd Kyu (Black)',
  '2nd Kyu (Black-Silver)',
  '1st Kyu (Black-Gold)',
  'Junior Dan',
] as const

export type RankedGrade = (typeof grades)[number]
export type Grade = RankedGrade | typeof UNRANKED

export interface GradeMeta {
  shortLabel: string
  colour: string
  track: GradeTrack
  order: number
  next: Grade | null
}

const rankedGradeMeta: Record<RankedGrade, GradeMeta> = {
  '6th Kyu': { shortLabel: '6th Kyu', colour: 'Blue', track: 'adult', order: 1, next: '5th Kyu' },
  '5th Kyu': { shortLabel: '5th Kyu', colour: 'Blue-Gold', track: 'adult', order: 2, next: '4th Kyu' },
  '4th Kyu': { shortLabel: '4th Kyu', colour: 'Brown', track: 'adult', order: 3, next: '3rd Kyu' },
  '3rd Kyu': { shortLabel: '3rd Kyu', colour: 'Brown-Gold', track: 'adult', order: 4, next: '2nd Kyu' },
  '2nd Kyu': { shortLabel: '2nd Kyu', colour: 'Black', track: 'adult', order: 5, next: '1st Kyu' },
  '1st Kyu': { shortLabel: '1st Kyu', colour: 'Black-Gold', track: 'adult', order: 6, next: 'Shodan' },
  Shodan: { shortLabel: 'Shodan', colour: 'Black', track: 'adult', order: 7, next: 'Nidan' },
  Nidan: { shortLabel: 'Nidan', colour: 'Black', track: 'adult', order: 8, next: '3rd Dan' },
  '3rd Dan': { shortLabel: '3rd Dan', colour: 'Black', track: 'adult', order: 9, next: '4th Dan' },
  '4th Dan': { shortLabel: '4th Dan', colour: 'Black', track: 'adult', order: 10, next: null },

  '12th Kyu (Red)': { shortLabel: '12th Kyu', colour: 'Red', track: 'children', order: 1, next: '11th Kyu (Red-Gold)' },
  '11th Kyu (Red-Gold)': { shortLabel: '11th Kyu', colour: 'Red-Gold', track: 'children', order: 2, next: '10th Kyu (Yellow)' },
  '10th Kyu (Yellow)': { shortLabel: '10th Kyu', colour: 'Yellow', track: 'children', order: 3, next: '9th Kyu (Orange)' },
  '9th Kyu (Orange)': { shortLabel: '9th Kyu', colour: 'Orange', track: 'children', order: 4, next: '8th Kyu (Green)' },
  '8th Kyu (Green)': { shortLabel: '8th Kyu', colour: 'Green', track: 'children', order: 5, next: '7th Kyu (Purple)' },
  '7th Kyu (Purple)': { shortLabel: '7th Kyu', colour: 'Purple', track: 'children', order: 6, next: '6th Kyu (Blue)' },
  '6th Kyu (Blue)': { shortLabel: '6th Kyu', colour: 'Blue', track: 'children', order: 7, next: '6th Kyu (Blue-Silver)' },
  '6th Kyu (Blue-Silver)': { shortLabel: '6th Kyu', colour: 'Blue-Silver', track: 'children', order: 8, next: '5th Kyu (Blue-Gold)' },
  '5th Kyu (Blue-Gold)': { shortLabel: '5th Kyu', colour: 'Blue-Gold', track: 'children', order: 9, next: '4th Kyu (Brown)' },
  '4th Kyu (Brown)': { shortLabel: '4th Kyu', colour: 'Brown', track: 'children', order: 10, next: '4th Kyu (Brown-Silver)' },
  '4th Kyu (Brown-Silver)': { shortLabel: '4th Kyu', colour: 'Brown-Silver', track: 'children', order: 11, next: '3rd Kyu (Brown-Silver)' },
  '3rd Kyu (Brown-Silver)': { shortLabel: '3rd Kyu', colour: 'Brown-Silver', track: 'children', order: 12, next: '2nd Kyu (Black)' },
  '2nd Kyu (Black)': { shortLabel: '2nd Kyu', colour: 'Black', track: 'children', order: 13, next: '2nd Kyu (Black-Silver)' },
  '2nd Kyu (Black-Silver)': { shortLabel: '2nd Kyu', colour: 'Black-Silver', track: 'children', order: 14, next: '1st Kyu (Black-Gold)' },
  '1st Kyu (Black-Gold)': { shortLabel: '1st Kyu', colour: 'Black-Gold', track: 'children', order: 15, next: 'Junior Dan' },
  'Junior Dan': { shortLabel: 'Junior Dan', colour: 'Black', track: 'children', order: 16, next: 'Shodan' },
}

export function getGradeMeta(grade: Grade): GradeMeta | null {
  return grade === UNRANKED ? null : rankedGradeMeta[grade]
}

export function nextGrade(grade: Grade, track: GradeTrack): Grade | null {
  if (grade === UNRANKED) return track === 'children' ? '12th Kyu (Red)' : '6th Kyu'
  return rankedGradeMeta[grade].next
}

export function gradeTrackForAge(age: number): GradeTrack {
  return age < 13 ? 'children' : 'adult'
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

export type CentreStatus = 'active' | 'closed' | 'under_renovation'

export interface Centre {
  id: string
  name: string
  shortName: string
  address: string
  timezone: string
  status: CentreStatus
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
  dateOfBirth: string
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
  gradingType: GradeTrack
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
  gradingType: GradeTrack
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
