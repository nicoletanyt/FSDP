export type GradeTrack = 'children' | 'adult'

export const UNRANKED = 'Unranked' as const

/**
 * Ranked grades, labelled with the wording printed in each syllabus coverage
 * column ("BLUE (6TH KYU)" on the adult sheet, "BLUE 6th KYU" on the
 * children's sheets). The silver grades are children's steps: adults are
 * awarded them as intermediate grades but never grade into them as a target.
 */
export const grades = [
  'Red (12th Kyu)',
  'Red-Gold (11th Kyu)',
  'Yellow (10th Kyu)',
  'Orange (9th Kyu)',
  'Green (8th Kyu)',
  'Purple (7th Kyu)',
  'Blue (6th Kyu)',
  'Blue-Silver (6th Kyu)',
  'Blue-Gold (5th Kyu)',
  'Brown (4th Kyu)',
  'Brown-Silver (4th Kyu)',
  'Brown-Gold (3rd Kyu)',
  'Black (2nd Kyu)',
  'Black-Silver (2nd Kyu)',
  'Black-Gold (1st Kyu)',
  'Junior Dan',
  '1st Dan',
  '2nd Dan',
  '3rd Dan',
  '4th Dan',
] as const

export type RankedGrade = (typeof grades)[number]
export type Grade = RankedGrade | typeof UNRANKED

export interface GradeMeta {
  colour: string
  /** Ladders that can award or target this grade. */
  tracks: GradeTrack[]
}

const rankedGradeMeta: Record<RankedGrade, GradeMeta> = {
  'Red (12th Kyu)': { colour: 'Red', tracks: ['children'] },
  'Red-Gold (11th Kyu)': { colour: 'Red-Gold', tracks: ['children'] },
  'Yellow (10th Kyu)': { colour: 'Yellow', tracks: ['children'] },
  'Orange (9th Kyu)': { colour: 'Orange', tracks: ['children'] },
  'Green (8th Kyu)': { colour: 'Green', tracks: ['children'] },
  'Purple (7th Kyu)': { colour: 'Purple', tracks: ['children'] },
  'Blue (6th Kyu)': { colour: 'Blue', tracks: ['children', 'adult'] },
  'Blue-Silver (6th Kyu)': { colour: 'Blue-Silver', tracks: ['children'] },
  'Blue-Gold (5th Kyu)': { colour: 'Blue-Gold', tracks: ['children', 'adult'] },
  'Brown (4th Kyu)': { colour: 'Brown', tracks: ['children', 'adult'] },
  'Brown-Silver (4th Kyu)': { colour: 'Brown-Silver', tracks: ['children'] },
  'Brown-Gold (3rd Kyu)': { colour: 'Brown-Gold', tracks: ['children', 'adult'] },
  'Black (2nd Kyu)': { colour: 'Black', tracks: ['children', 'adult'] },
  'Black-Silver (2nd Kyu)': { colour: 'Black-Silver', tracks: ['children'] },
  'Black-Gold (1st Kyu)': { colour: 'Black-Gold', tracks: ['adult'] },
  'Junior Dan': { colour: 'Black', tracks: ['adult'] },
  '1st Dan': { colour: 'Black', tracks: ['adult'] },
  '2nd Dan': { colour: 'Black', tracks: ['adult'] },
  '3rd Dan': { colour: 'Black', tracks: ['adult'] },
  '4th Dan': { colour: 'Black', tracks: ['adult'] },
}

/** Children's grading as published: 12th Kyu through 2nd Kyu (Black-Silver). */
export const childrenLadder: RankedGrade[] = [
  'Red (12th Kyu)',
  'Red-Gold (11th Kyu)',
  'Yellow (10th Kyu)',
  'Orange (9th Kyu)',
  'Green (8th Kyu)',
  'Purple (7th Kyu)',
  'Blue (6th Kyu)',
  'Blue-Silver (6th Kyu)',
  'Blue-Gold (5th Kyu)',
  'Brown (4th Kyu)',
  'Brown-Silver (4th Kyu)',
  'Brown-Gold (3rd Kyu)',
  'Black (2nd Kyu)',
  'Black-Silver (2nd Kyu)',
]

/**
 * Adult grading as published: 6th Kyu through 4th Dan. Junior Dan branches off
 * 1st Kyu for candidates aged 14 and below, so it is tracked separately.
 */
export const adultLadder: RankedGrade[] = [
  'Blue (6th Kyu)',
  'Blue-Gold (5th Kyu)',
  'Brown (4th Kyu)',
  'Brown-Gold (3rd Kyu)',
  'Black (2nd Kyu)',
  'Black-Gold (1st Kyu)',
  '1st Dan',
  '2nd Dan',
  '3rd Dan',
  '4th Dan',
]

export const juniorDanLadder: RankedGrade[] = [
  ...adultLadder.slice(0, 6),
  'Junior Dan',
]

/**
 * A student who turns 13 keeps their belt and continues on the adult syllabus
 * at the "most corresponding grade" (adult sheet notes 5 and 6). 7th Kyu and
 * below submit directly for 6th Kyu; an intermediate award counts as having
 * passed its kyu.
 */
const adultEntryFromChildren: Partial<Record<RankedGrade, RankedGrade>> = {
  'Red (12th Kyu)': 'Blue (6th Kyu)',
  'Red-Gold (11th Kyu)': 'Blue (6th Kyu)',
  'Yellow (10th Kyu)': 'Blue (6th Kyu)',
  'Orange (9th Kyu)': 'Blue (6th Kyu)',
  'Green (8th Kyu)': 'Blue (6th Kyu)',
  'Purple (7th Kyu)': 'Blue (6th Kyu)',
  'Blue (6th Kyu)': 'Blue-Gold (5th Kyu)',
  'Blue-Silver (6th Kyu)': 'Blue-Gold (5th Kyu)',
  'Blue-Gold (5th Kyu)': 'Brown (4th Kyu)',
  'Brown (4th Kyu)': 'Brown-Gold (3rd Kyu)',
  'Brown-Silver (4th Kyu)': 'Brown-Gold (3rd Kyu)',
  'Brown-Gold (3rd Kyu)': 'Black (2nd Kyu)',
  'Black (2nd Kyu)': 'Black-Gold (1st Kyu)',
  'Black-Silver (2nd Kyu)': 'Black-Gold (1st Kyu)',
}

function ladderNext(
  ladder: RankedGrade[],
): Partial<Record<RankedGrade, RankedGrade>> {
  const next: Partial<Record<RankedGrade, RankedGrade>> = {}
  ladder.forEach((grade, index) => {
    const following = ladder[index + 1]
    if (following) next[grade] = following
  })
  return next
}

const childrenNext = ladderNext(childrenLadder)
const adultNext = ladderNext(adultLadder)

export function getGradeMeta(grade: Grade): GradeMeta | null {
  return grade === UNRANKED ? null : rankedGradeMeta[grade]
}

export function ladderFor(track: GradeTrack): RankedGrade[] {
  return track === 'children' ? childrenLadder : adultLadder
}

/**
 * Next grade on the student's ladder. `age` (calendar-year age) resolves the
 * Junior Dan branch at 1st Kyu; without it the full Dan path is assumed.
 */
export function nextGrade(
  grade: Grade,
  track: GradeTrack,
  age?: number,
): Grade | null {
  if (grade === UNRANKED) {
    return track === 'children' ? 'Red (12th Kyu)' : 'Blue (6th Kyu)'
  }

  if (track === 'children') {
    return childrenNext[grade] ?? null
  }

  if (grade === 'Black-Gold (1st Kyu)') {
    return age !== undefined && age <= 14 ? 'Junior Dan' : '1st Dan'
  }
  if (grade === 'Junior Dan') return '1st Dan'

  return adultNext[grade] ?? adultEntryFromChildren[grade] ?? null
}

export function gradeTrackForAge(age: number): GradeTrack {
  return age < 13 ? 'children' : 'adult'
}

export type MembershipStatus = 'active' | 'expired' | 'pending'
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'
export type RiskLevel = 'healthy' | 'at_risk'
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

/**
 * One syllabus item an instructor has signed off for a student. `itemId` is
 * the stable id from `syllabus.ts` (`track/grade/column/item`), so a sign-off
 * stays attached if the checklist is re-ordered and a children's sign-off never
 * counts towards the adult sheet.
 */
export interface TechniqueSignOff {
  id: string
  studentId: string
  itemId: string
  signedOffAt: string
  signedOffBy: string
  note?: string
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
