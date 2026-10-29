import {
  addDays,
  daysAgoIso,
  daysAheadIso,
  fullName,
  startOfDay,
  toIsoDate,
} from './format'
import type {
  AttendanceRecord,
  AttendanceStatus,
  Centre,
  GradingApplication,
  GradingOpportunity,
  Instructor,
  NotificationEntry,
  Session,
  Student,
} from './types'

const reference = startOfDay()

function isoOffset(days: number): string {
  return toIsoDate(addDays(reference, days))
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number) {
  let state = seed || 1
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}

export const centres: Centre[] = [
  {
    id: 'centre-bukit-timah',
    name: 'Bukit Timah Dojo',
    shortName: 'Bukit Timah',
    address: '12 Chun Tin Road, Singapore 599899',
    timezone: 'Asia/Singapore',
  },
  {
    id: 'centre-serangoon',
    name: 'Serangoon Dojo',
    shortName: 'Serangoon',
    address: '18 Serangoon Central, Singapore 556072',
    timezone: 'Asia/Singapore',
  },
  {
    id: 'centre-tampines',
    name: 'Tampines Dojo',
    shortName: 'Tampines',
    address: '5 Tampines Avenue 3, Singapore 529705',
    timezone: 'Asia/Singapore',
  },
  {
    id: 'centre-jurong',
    name: 'Jurong Dojo',
    shortName: 'Jurong',
    address: '50 Jurong West Street 41, Singapore 649369',
    timezone: 'Asia/Singapore',
  },
]

export const instructors: Instructor[] = [
  {
    id: 'instructor-mori',
    firstName: 'Kenji',
    lastName: 'Mori',
    email: 'kenji.mori@example.test',
    centreIds: ['centre-bukit-timah', 'centre-jurong'],
  },
  {
    id: 'instructor-tan',
    firstName: 'Wei Ming',
    lastName: 'Tan',
    email: 'weiming.tan@example.test',
    centreIds: ['centre-serangoon', 'centre-tampines'],
  },
  {
    id: 'instructor-nair',
    firstName: 'Ananya',
    lastName: 'Nair',
    email: 'ananya.nair@example.test',
    centreIds: ['centre-tampines', 'centre-bukit-timah'],
  },
  {
    id: 'instructor-sato',
    firstName: 'Hiroshi',
    lastName: 'Sato',
    email: 'hiroshi.sato@example.test',
    centreIds: ['centre-jurong', 'centre-serangoon'],
  },
]

const studentNames: [string, string][] = [
  ['Aiko', 'Tanaka'],
  ['Ethan', 'Lim'],
  ['Priya', 'Nair'],
  ['Marcus', 'Tan'],
  ['Sofia', 'Reyes'],
  ['Daniel', 'Ong'],
  ['Mei Ling', 'Chua'],
  ['Arjun', 'Patel'],
  ['Hana', 'Sato'],
  ['Lucas', 'Wong'],
  ['Nur', 'Aisyah'],
  ['Caleb', 'Ng'],
  ['Yuki', 'Nakamura'],
  ['Ryan', 'Koh'],
  ['Elena', 'Garcia'],
  ['Isaac', 'Teo'],
  ['Siti', 'Rahman'],
  ['Oliver', 'Chen'],
  ['Grace', 'Lim'],
  ['Kenji', 'Watanabe'],
  ['Zoe', 'Lee'],
  ['Adam', 'Malik'],
  ['Chloe', 'Goh'],
  ['Noah', 'Tan'],
  ['Amara', 'Singh'],
  ['Leon', 'Ho'],
  ['Mia', 'Fernandez'],
  ['Jayden', 'Yeo'],
  ['Sara', 'Ibrahim'],
  ['Felix', 'Chua'],
  ['Isabelle', 'Ng'],
  ['Ravi', 'Kumar'],
  ['Emma', 'Lau'],
  ['Haruto', 'Ito'],
  ['Nadia', 'Hassan'],
  ['Gabriel', 'Sim'],
]

const gradeSequence = ['6th Kyu', '5th Kyu', '4th Kyu', '3rd Kyu', '2nd Kyu', '1st Kyu', 'Shodan'] as const

function studentEmail(firstName: string, lastName: string): string {
  return `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.test'
}

export const students: Student[] = studentNames.map(([firstName, lastName], index) => {
  const centre = centres[index % centres.length]
  const currentGrade = gradeSequence[index % gradeSequence.length]
  const membershipStatus =
    index % 13 === 0 ? 'expired' : index % 17 === 0 ? 'pending' : 'active'
  const followUpStatus =
    index % 10 === 8 ? 'contacted' : index % 10 === 7 ? 'flagged' : 'none'

  return {
    id: `student-${String(index + 1).padStart(3, '0')}`,
    memberNo: `SK-${String(1001 + index)}`,
    firstName,
    lastName,
    email: studentEmail(firstName, lastName),
    phone: `+65 9${String(1000 + index * 37).slice(-3)} ${String(2000 + index * 53).slice(-4)}`,
    homeCentreId: centre.id,
    currentGrade,
    membershipStatus,
    joinedAt: isoOffset(-(420 + (index % 9) * 40)),
    lastGradedAt: index % 9 === 0 ? null : isoOffset(-(70 + (index % 7) * 35)),
    followUpStatus,
    outstandingFees: index % 11 === 0,
  }
})

function sessionTypeFor(index: number) {
  return index % 3 === 0 ? 'weapons' : 'regular'
}

export const sessions: Session[] = []

centres.forEach((centre, centreIndex) => {
  const primaryInstructor = instructors[centreIndex % instructors.length]

  for (let week = 11; week >= 0; week--) {
    const offsets = [-(week * 7) - 1, -(week * 7) - 3]

    offsets.forEach((offset, sessionIndex) => {
      const type = sessionTypeFor(week + sessionIndex)
      sessions.push({
        id: `ses-${centreIndex}-${week}-${sessionIndex}`,
        centreId: centre.id,
        instructorId:
          sessionIndex === 0
            ? primaryInstructor.id
            : instructors[(centreIndex + 1) % instructors.length].id,
        title: type === 'weapons' ? 'Weapons class' : 'Evening practice',
        date: isoOffset(offset),
        startTime: type === 'weapons' ? '19:30' : '18:30',
        durationMinutes: 75,
        type,
        isExternal: false,
      })
    })
  }

  sessions.push({
    id: `ses-${centreIndex}-today`,
    centreId: centre.id,
    instructorId: primaryInstructor.id,
    title: 'Evening practice',
    date: isoOffset(0),
    startTime: '18:30',
    durationMinutes: 75,
    type: 'regular',
    isExternal: false,
  })

  sessions.push({
    id: `ses-${centreIndex}-upcoming-1`,
    centreId: centre.id,
    instructorId: primaryInstructor.id,
    title: 'Evening practice',
    date: daysAheadIso(3),
    startTime: '18:30',
    durationMinutes: 75,
    type: 'regular',
    isExternal: false,
  })

  sessions.push({
    id: `ses-${centreIndex}-upcoming-2`,
    centreId: centre.id,
    instructorId: instructors[(centreIndex + 1) % instructors.length].id,
    title: 'Weapons class',
    date: daysAheadIso(5),
    startTime: '19:30',
    durationMinutes: 75,
    type: 'weapons',
    isExternal: false,
  })

  ;[10, 35, 65].forEach((days, externalIndex) => {
    sessions.push({
      id: `ses-${centreIndex}-external-${externalIndex}`,
      centreId: centre.id,
      instructorId: primaryInstructor.id,
      title: 'Joint centre seminar',
      date: isoOffset(-days),
      startTime: '09:00',
      durationMinutes: 180,
      type: 'external',
      isExternal: true,
      externalLocation: 'Toa Payoh Sports Hall · Shinju-Kai joint seminar',
    })
  })
})

sessions.sort((left, right) =>
  `${left.date}T${left.startTime}`.localeCompare(`${right.date}T${right.startTime}`),
)

const today = toIsoDate(reference)

function attendanceStatus(
  profile: number,
  session: Session,
  student: Student,
): AttendanceStatus {
  const random = seededRandom(hashString(`${student.id}:${session.id}`))
  const age = Math.max(
    0,
    Math.round(
      (new Date(`${today}T00:00:00`).getTime() -
        new Date(`${session.date}T00:00:00`).getTime()) /
        86_400_000,
    ),
  )

  let probability: number
  if (profile <= 5) {
    probability = 0.9 - profile * 0.01
  } else if (profile === 6) {
    probability = 0.78
  } else if (profile === 7) {
    probability = age <= 30 ? 0.32 : 0.9
  } else if (profile === 8) {
    probability = age <= 14 ? 0.04 : 0.5
  } else {
    probability = 0.58
  }

  if (session.isExternal) probability *= 0.55

  return random() < probability
    ? random() < 0.16
      ? 'late'
      : 'present'
    : random() < 0.06
      ? 'excused'
      : 'absent'
}

export const attendance: AttendanceRecord[] = []
const studentIndexById = new Map(students.map((student, index) => [student.id, index]))
const instructorById = new Map(instructors.map((instructor) => [instructor.id, instructor]))

for (const session of sessions) {
  if (session.date > today) continue

  const instructor = instructorById.get(session.instructorId)
  const roster = students.filter((student) => student.homeCentreId === session.centreId)
  const centreIndex = centres.findIndex((centre) => centre.id === session.centreId)

  const externalGuests = session.isExternal
    ? students.filter(
        (student) =>
          student.homeCentreId === centres[(centreIndex + 1) % centres.length].id,
      ).slice(0, 2)
    : []

  for (const student of [...roster, ...externalGuests]) {
    const profile = (studentIndexById.get(student.id) ?? 0) % 10
    attendance.push({
      id: `att-${session.id}-${student.id}`,
      sessionId: session.id,
      studentId: student.id,
      status: attendanceStatus(profile, session, student),
      recordedAt: `${session.date}T20:30:00`,
      recordedBy: instructor ? fullName(instructor) : 'Centre administrator',
    })
  }
}

export const opportunities: GradingOpportunity[] = [
  {
    id: 'opportunity-autumn-bukit-timah',
    title: 'Autumn grading — Bukit Timah',
    centreId: 'centre-bukit-timah',
    instructorId: 'instructor-mori',
    date: daysAheadIso(21),
    applicationDeadline: daysAheadIso(10),
    targetGrades: ['5th Kyu', '4th Kyu', '3rd Kyu'],
    status: 'open',
  },
  {
    id: 'opportunity-autumn-serangoon',
    title: 'Autumn grading — Serangoon',
    centreId: 'centre-serangoon',
    instructorId: 'instructor-tan',
    date: daysAheadIso(28),
    applicationDeadline: daysAheadIso(14),
    targetGrades: ['5th Kyu', '4th Kyu', '3rd Kyu'],
    status: 'open',
  },
  {
    id: 'opportunity-winter-tampines',
    title: 'Winter grading — Tampines',
    centreId: 'centre-tampines',
    instructorId: 'instructor-nair',
    date: daysAheadIso(42),
    applicationDeadline: daysAheadIso(28),
    targetGrades: ['3rd Kyu', '2nd Kyu', '1st Kyu'],
    status: 'open',
  },
  {
    id: 'opportunity-summer-jurong',
    title: 'Summer grading — Jurong',
    centreId: 'centre-jurong',
    instructorId: 'instructor-sato',
    date: daysAgoIso(30),
    applicationDeadline: daysAgoIso(45),
    targetGrades: ['5th Kyu', '4th Kyu', '3rd Kyu'],
    status: 'closed',
  },
]

export const applications: GradingApplication[] = [
  {
    id: 'application-001',
    studentId: 'student-001',
    opportunityId: 'opportunity-autumn-bukit-timah',
    targetGrade: '5th Kyu',
    submittedAt: daysAgoIso(4),
    status: 'submitted',
    notes: 'Attending Tuesday and Thursday sessions.',
  },
  {
    id: 'application-002',
    studentId: 'student-017',
    opportunityId: 'opportunity-autumn-bukit-timah',
    targetGrade: '3rd Kyu',
    submittedAt: daysAgoIso(6),
    status: 'under_review',
  },
  {
    id: 'application-003',
    studentId: 'student-009',
    opportunityId: 'opportunity-autumn-bukit-timah',
    targetGrade: '4th Kyu',
    submittedAt: daysAgoIso(8),
    status: 'submitted',
  },
  {
    id: 'application-004',
    studentId: 'student-002',
    opportunityId: 'opportunity-autumn-serangoon',
    targetGrade: '4th Kyu',
    submittedAt: daysAgoIso(5),
    status: 'submitted',
    notes: 'First grading attempt.',
  },
  {
    id: 'application-005',
    studentId: 'student-010',
    opportunityId: 'opportunity-autumn-serangoon',
    targetGrade: '3rd Kyu',
    submittedAt: daysAgoIso(9),
    status: 'under_review',
  },
  {
    id: 'application-006',
    studentId: 'student-022',
    opportunityId: 'opportunity-autumn-serangoon',
    targetGrade: '5th Kyu',
    submittedAt: daysAgoIso(12),
    status: 'withdrawn',
  },
  {
    id: 'application-007',
    studentId: 'student-003',
    opportunityId: 'opportunity-winter-tampines',
    targetGrade: '3rd Kyu',
    submittedAt: daysAgoIso(2),
    status: 'submitted',
  },
  {
    id: 'application-008',
    studentId: 'student-011',
    opportunityId: 'opportunity-winter-tampines',
    targetGrade: '2nd Kyu',
    submittedAt: daysAgoIso(3),
    status: 'submitted',
  },
]

export const notifications: NotificationEntry[] = [
  {
    id: 'notification-001',
    channel: 'email',
    template: 'Grading invitation',
    audience: 'Eligible students — Bukit Timah',
    recipientCount: 7,
    sentAt: `${daysAgoIso(2)}T09:15:00`,
    deliveredCount: 7,
    failedCount: 0,
  },
  {
    id: 'notification-002',
    channel: 'in_app',
    template: 'Attendance concern',
    audience: 'Declining attendance — all centres',
    recipientCount: 11,
    sentAt: `${daysAgoIso(5)}T16:40:00`,
    deliveredCount: 10,
    failedCount: 1,
  },
  {
    id: 'notification-003',
    channel: 'email',
    template: 'General reminder',
    audience: 'Serangoon — all students',
    recipientCount: 9,
    sentAt: `${daysAgoIso(8)}T08:05:00`,
    deliveredCount: 9,
    failedCount: 0,
  },
  {
    id: 'notification-004',
    channel: 'email',
    template: 'Grading invitation',
    audience: 'Eligible students — Serangoon',
    recipientCount: 5,
    sentAt: `${daysAgoIso(10)}T10:30:00`,
    deliveredCount: 5,
    failedCount: 0,
  },
  {
    id: 'notification-005',
    channel: 'in_app',
    template: 'Attendance concern',
    audience: 'Selected students',
    recipientCount: 3,
    sentAt: `${daysAgoIso(14)}T14:20:00`,
    deliveredCount: 3,
    failedCount: 0,
  },
  {
    id: 'notification-006',
    channel: 'email',
    template: 'General reminder',
    audience: 'All active students',
    recipientCount: 33,
    sentAt: `${daysAgoIso(20)}T07:45:00`,
    deliveredCount: 32,
    failedCount: 1,
  },
]

export const initialAdminData = {
  centres,
  instructors,
  students,
  sessions,
  attendance,
  opportunities,
  applications,
  notifications,
}

export type AdminData = typeof initialAdminData
