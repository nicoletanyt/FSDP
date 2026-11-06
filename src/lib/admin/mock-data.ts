import {
  addDays,
  daysAgoIso,
  daysAheadIso,
  fullName,
  startOfDay,
  toIsoDate,
  yearAgeFromIso,
} from './format'
import { getGradeSyllabusItems } from './syllabus'
import { gradeTrackForAge, nextGrade } from './types'
import type {
  AttendanceRecord,
  AttendanceStatus,
  Centre,
  Grade,
  GradeTrack,
  GradingApplication,
  GradingOpportunity,
  Instructor,
  NotificationEntry,
  Session,
  Student,
  TechniqueSignOff,
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
    id: 'centre-ask-hq',
    name: 'ASK Headquarters Dojo',
    shortName: 'ASK HQ',
    address: 'Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-bdas',
    name: 'ActiveSG Bedok Dojo',
    shortName: 'BDAS',
    address:
      'Heartbeat@Bedok, 11 Bedok North Street 1 #01-02, Singapore 469662',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-bdcc',
    name: 'Bedok Community Centre Dojo',
    shortName: 'BDCC',
    address: 'Bedok Community Centre, 850 New Upper Changi Rd, Singapore 467352',
    timezone: 'Asia/Singapore',
    status: 'closed',
  },
  {
    id: 'centre-ehis',
    name: 'Etonhouse International School Dojo',
    shortName: 'EHIS',
    address: '51 Broadrick Rd, Singapore 439501',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-kkcc',
    name: 'Kampong Kembangan Community Club Dojo',
    shortName: 'KKCC',
    address: '5 Lengkong Tiga, Singapore 417408',
    timezone: 'Asia/Singapore',
    status: 'under_renovation',
  },
  {
    id: 'centre-mccc',
    name: 'MacPherson Community Club',
    shortName: 'MCCC',
    address: '400 Paya Lebar Way, Singapore 379131',
    timezone: 'Asia/Singapore',
    status: 'closed',
  },
  {
    id: 'centre-mpcc',
    name: 'Marine Parade Dojo',
    shortName: 'MPCC',
    address: '278 Marine Parade Rd, Singapore 449282',
    timezone: 'Asia/Singapore',
    status: 'under_renovation',
  },
  {
    id: 'centre-nsrcc',
    name: 'National Service Resort & Country Club',
    shortName: 'NSRCC',
    address: '10 Changi Coast Walk, Singapore 499739',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-oth',
    name: 'Our Tampines Hub',
    shortName: 'OTH',
    address: '1 Tampines Walk, Singapore 528523',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-plkc',
    name: 'Paya Lebar Kovan Dojo',
    shortName: 'PLKC',
    address: '207 Hougang Street 21, Singapore 530207',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-rvaf',
    name: 'Rivervale Dojo',
    shortName: 'RVAF',
    address: 'Rivervale Mall, 11 Rivervale Cres, Singapore 545082',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-skas',
    name: 'ActiveSG Seng Kang Dojo',
    shortName: 'SKAS',
    address: '57 Anchorvale Rd, Singapore 544964',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-sscc',
    name: 'Siglap South Dojo',
    shortName: 'SSCC',
    address: '6 Palm Rd, Singapore 456441',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-twcc',
    name: 'Tampines West Dojo',
    shortName: 'TWCC',
    address: '5 Tampines Ave 3, Singapore 529705',
    timezone: 'Asia/Singapore',
    status: 'closed',
  },
  {
    id: 'centre-bsas',
    name: 'ActiveSG Bishan Dojo',
    shortName: 'BSAS',
    address: '5 Bishan Street 14, Singapore 579783',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-btcc',
    name: 'Bukit Timah Dojo',
    shortName: 'BTCC',
    address: 'Bukit Timah Community Club, 20 Toh Yi Dr, Singapore 596569',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-cscc',
    name: 'Cheng San Dojo',
    shortName: 'CSCC',
    address: '6 Ang Mo Kio Street 53, Singapore 569205',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-ehrw',
    name: 'EtonHouse Pre-School Robertson Walk',
    shortName: 'EHRW',
    address: '11 Unity St, #02-20, Singapore 237995',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-japa',
    name: 'Japanese Association Dojo',
    shortName: 'JAPA',
    address: '120 Adam Rd, Singapore 289899',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-sici',
    name: 'The Singapore Island Country Club Dojo',
    shortName: 'SICI',
    address: '240 Sime Rd, Singapore 288303',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-smuc',
    name: 'SMU Dojo',
    shortName: 'SMUC',
    address:
      'Singapore Management University, 81 Victoria St, Singapore 188065',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-stpy',
    name: 'SAFRA Toa Payoh Dojo',
    shortName: 'STPY',
    address: '293 Lor 6 Toa Payoh, Singapore 319387',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-tscc',
    name: 'Thomson Dojo',
    shortName: 'TSCC',
    address: '233 Bishan Street 22, Singapore 570233',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-ykas',
    name: 'ActiveSG Yio Chu Kang Dojo',
    shortName: 'YKAS',
    address: '200 Ang Mo Kio Ave 9, Singapore 569770',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-agora',
    name: 'AGORA Colearning',
    shortName: 'AGORA',
    address:
      '1 Maritime Square, HarbourFront Centre, #04-01, Singapore 099253',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-ehsc',
    name: 'EtonHouse International School Sentosa',
    shortName: 'EHSC',
    address: '33 Allanbrooke Rd, Singapore 099981',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-tgpc',
    name: 'Tanjong Pagar Dojo',
    shortName: 'TGPC',
    address:
      'Tanjong Pagar Community Club, 101 Cantonment Rd, Singapore 089774',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-arca',
    name: 'Alexandra Retail Centre Dojo',
    shortName: 'ARCA',
    address: '460 Alexandra Road #03-02, Singapore 119963',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-cscb',
    name: 'Civil Service Club (Bukit Batok) Dojo',
    shortName: 'CSCB',
    address: '91 Bukit Batok West Ave 2, Singapore 659206',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-gpcc',
    name: 'Gek Poh Dojo',
    shortName: 'GPCC',
    address:
      'Gek Poh Ville Community Club, 1 Jurong West Street 74, Singapore 649149',
    timezone: 'Asia/Singapore',
    status: 'under_renovation',
  },
  {
    id: 'centre-htns-bb',
    name: 'HomeTeamNS – Bukit Batok Dojo',
    shortName: 'HTNS-BB',
    address: 'HomeTeamNS @ Bukit Batok, Singapore 659003',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-jeas',
    name: 'ActiveSG Jurong East',
    shortName: 'JEAS',
    address: '21 Jurong East Street 31, Singapore 609517',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-tfcc',
    name: 'The Frontier Dojo',
    shortName: 'TFCC',
    address: '665a Jurong West Street 65, Singapore 641665',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-wccc',
    name: 'West Coast Dojo',
    shortName: 'WCCC',
    address: '2 Clementi West Street 2, Singapore 129605',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-cckc',
    name: 'Chua Chu Kang Dojo',
    shortName: 'CCKC',
    address: '35 Teck Whye Ave, Singapore 688892',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-cpcc',
    name: 'Chong Pang Dojo',
    shortName: 'CPCC',
    address: '109 Yishun Ring Rd, Singapore 760109',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-fccc',
    name: 'Fu Chun Dojo',
    shortName: 'FCCC',
    address: 'Woodgrove Zone 10 RN, Blk 310 Link Hall',
    timezone: 'Asia/Singapore',
    status: 'under_renovation',
  },
  {
    id: 'centre-htns-kt',
    name: 'HometeamNS Khatib',
    shortName: 'HTNS-KT',
    address: '2 Yishun Walk, Singapore 767944',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-nypa',
    name: 'Nanyang Polytechnic Dojo',
    shortName: 'NYPA',
    address: '180 Ang Mo Kio Ave 8, Singapore 569830',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-occa',
    name: 'Orchid Country Club Dojo',
    shortName: 'OCCA',
    address: '1 Orchid Club Rd, Singapore 769162',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-rpac',
    name: 'Republic Polytechnic',
    shortName: 'RPAC',
    address: '9 Woodlands Ave 9, Singapore 738964',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-wdas',
    name: 'ActiveSG Woodlands Dojo',
    shortName: 'WDAS',
    address: '2 Woodlands Street 12, Singapore 738599',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-cycc',
    name: 'Ci Yuan Dojo',
    shortName: 'CYCC',
    address: '51 Hougang Ave 9, Singapore 538776',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-p21c',
    name: 'Punggol 21 Dojo',
    shortName: 'P21C',
    address: '80 Punggol Field, Singapore 828815',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
  {
    id: 'centre-sjcc',
    name: 'Senja-Cashew Community Club Dojo',
    shortName: 'SJCC',
    address: '101 Bukit Panjang Rd, Singapore 679910',
    timezone: 'Asia/Singapore',
    status: 'active',
  },
]

export const activeCentres = centres.filter(
  (centre) => centre.status === 'active',
)

const activeCentreIds = activeCentres.map((centre) => centre.id)

function instructorCentreIds(index: number) {
  return activeCentreIds.filter(
    (_, centreIndex) => centreIndex % 4 === index,
  )
}

export const instructors: Instructor[] = [
  {
    id: 'instructor-mori',
    firstName: 'Kenji',
    lastName: 'Mori',
    email: 'kenji.mori@example.test',
    centreIds: instructorCentreIds(0),
  },
  {
    id: 'instructor-tan',
    firstName: 'Wei Ming',
    lastName: 'Tan',
    email: 'weiming.tan@example.test',
    centreIds: instructorCentreIds(1),
  },
  {
    id: 'instructor-nair',
    firstName: 'Ananya',
    lastName: 'Nair',
    email: 'ananya.nair@example.test',
    centreIds: instructorCentreIds(2),
  },
  {
    id: 'instructor-sato',
    firstName: 'Hiroshi',
    lastName: 'Sato',
    email: 'hiroshi.sato@example.test',
    centreIds: instructorCentreIds(3),
  },
]

const baseStudentNames: [string, string][] = [
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

const extraFirstNames = [
  'Aiden',
  'Bella',
  'Cheng',
  'Divya',
  'Elijah',
  'Farah',
  'Gavin',
  'Hazel',
  'Ivan',
  'Jasmine',
  'Kai',
  'Lena',
  'Mohan',
  'Nina',
  'Owen',
  'Pearl',
  'Quinn',
  'Rafael',
  'Shannon',
  'Tara',
  'Umar',
  'Vera',
]

const extraLastNames = [
  'Ang',
  'Balakrishnan',
  'Chan',
  'Dewi',
  'Foo',
  'Goh',
  'Huang',
  'Iyer',
  'Jiang',
  'Kwek',
  'Loh',
  'Menon',
  'Poh',
  'Quek',
  'Rahim',
  'Soh',
]

const generatedStudentNames: [string, string][] = Array.from(
  { length: 110 },
  (_, index) => [
    extraFirstNames[index % extraFirstNames.length],
    extraLastNames[(index * 7) % extraLastNames.length],
  ],
)

const studentNames: [string, string][] = [
  ...baseStudentNames,
  ...generatedStudentNames,
]

/** Weighted pools so each dojo covers a handful of neighbouring grades. */
const adultGradePool = [
  'Unranked',
  'Blue (6th Kyu)',
  'Blue (6th Kyu)',
  'Blue-Gold (5th Kyu)',
  'Blue-Gold (5th Kyu)',
  'Brown (4th Kyu)',
  'Brown (4th Kyu)',
  'Brown-Gold (3rd Kyu)',
  'Brown-Gold (3rd Kyu)',
  'Black (2nd Kyu)',
  'Black-Gold (1st Kyu)',
  '1st Dan',
  '2nd Dan',
  '3rd Dan',
  '1st Dan',
] as const

const childrenGradePool = [
  'Unranked',
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
] as const

function dateOfBirthFor(index: number, track: 'children' | 'adult'): string {
  const age = track === 'children' ? 6 + (index % 7) : 14 + (index % 45)
  const month = index % 12
  const day = 1 + ((index * 7) % 27)
  return toIsoDate(new Date(reference.getFullYear() - age, month, day))
}

export const students: Student[] = studentNames.map(([firstName, lastName], index) => {
  const centre = activeCentres[index % activeCentres.length]
  const track = index % 5 < 2 ? 'children' : 'adult'
  const pool = track === 'children' ? childrenGradePool : adultGradePool
  const centreIndex = index % activeCentres.length
  const positionInCentre = Math.floor(index / activeCentres.length)
  const recentlyJoined = index % 23 === 0
  const currentGrade = recentlyJoined
    ? 'Unranked'
    : pool[(centreIndex + positionInCentre) % pool.length]
  const membershipStatus =
    index % 13 === 0 ? 'expired' : index % 17 === 0 ? 'pending' : 'active'
  const followUpStatus =
    index % 10 === 8 ? 'contacted' : index % 10 === 7 ? 'flagged' : 'none'

  return {
    id: `student-${String(index + 1).padStart(3, '0')}`,
    memberNo: `SK-${String(1001 + index)}`,
    firstName,
    lastName,
    // Mock UI only. The unique emails in public.students are not overwritten.
    email: 'mq07110@gmail.com',
    phone: `+65 9${String(1000 + index * 37).slice(-3)} ${String(2000 + index * 53).slice(-4)}`,
    homeCentreId: centre.id,
    dateOfBirth: dateOfBirthFor(index, track),
    currentGrade,
    membershipStatus,
    joinedAt: recentlyJoined
      ? isoOffset(-(30 + (index % 3) * 20))
      : isoOffset(-(420 + (index % 9) * 40)),
    lastGradedAt:
      currentGrade === 'Unranked'
        ? null
        : isoOffset(-(70 + (index % 7) * 35)),
    followUpStatus,
    outstandingFees: index % 11 === 0,
  }
})

/**
 * Deterministic syllabus sign-offs for each student's target grade row.
 * Roughly half are fully signed off and the rest are partway through, so the
 * eligibility spread stays believable without a backend.
 */
export const techniqueSignOffs: TechniqueSignOff[] = students.flatMap(
  (student, index) => {
    const age = yearAgeFromIso(student.dateOfBirth)
    const track = gradeTrackForAge(age)
    const target = nextGrade(student.currentGrade, track, age)
    if (!target) return []

    const items = getGradeSyllabusItems(target, track)
    const ratio = [1, 1, 1, 0.9, 0.75, 0.5][hashString(student.id) % 6] ?? 1
    const signedCount = Math.floor(items.length * ratio)
    const instructor = instructors[index % instructors.length]

    return items.slice(0, signedCount).map((item, itemIndex) => ({
      id: `signoff-${student.id}-${itemIndex}`,
      studentId: student.id,
      itemId: item.id,
      signedOffAt: isoOffset(-(12 + ((index + itemIndex) % 9) * 6)),
      signedOffBy: fullName(instructor),
    }))
  },
)

function sessionTypeFor(index: number) {
  return index % 3 === 0 ? 'weapons' : 'regular'
}

export const sessions: Session[] = []

activeCentres.forEach((centre, centreIndex) => {
  const primaryInstructor = instructors[centreIndex % instructors.length]

  for (let week = 43; week >= 0; week--) {
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
const recentBookingStart = daysAgoIso(29)
const studentIndexById = new Map(students.map((student, index) => [student.id, index]))
const instructorById = new Map(instructors.map((instructor) => [instructor.id, instructor]))

for (const session of sessions) {
  if (session.date > today) continue

  const instructor = instructorById.get(session.instructorId)
  const roster = students.filter((student) => student.homeCentreId === session.centreId)
  const centreIndex = activeCentres.findIndex(
    (centre) => centre.id === session.centreId,
  )

  const externalGuests = session.isExternal
    ? students.filter(
        (student) =>
          student.homeCentreId ===
          activeCentres[(centreIndex + 1) % activeCentres.length].id,
      ).slice(0, 2)
    : []

  for (const student of [...roster, ...externalGuests]) {
    const profile = (studentIndexById.get(student.id) ?? 0) % 10
    // A few demo students stopped booking classes; no attendance row means no booking.
    if (profile === 7 && session.date >= recentBookingStart) continue
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
    title: "Autumn children's grading — Bukit Timah",
    centreId: 'centre-btcc',
    instructorId: 'instructor-mori',
    gradingType: 'children',
    date: daysAheadIso(21),
    applicationDeadline: daysAheadIso(7),
    targetGrades: ['Brown-Silver (4th Kyu)', 'Black (2nd Kyu)'],
    status: 'open',
  },
  {
    id: 'opportunity-autumn-serangoon',
    title: "Autumn children's grading — Ci Yuan",
    centreId: 'centre-cycc',
    instructorId: 'instructor-tan',
    gradingType: 'children',
    date: daysAheadIso(28),
    applicationDeadline: daysAheadIso(14),
    targetGrades: ['Purple (7th Kyu)'],
    status: 'open',
  },
  {
    id: 'opportunity-winter-tampines',
    title: 'Winter grading — Tampines',
    centreId: 'centre-oth',
    instructorId: 'instructor-nair',
    gradingType: 'adult',
    date: daysAheadIso(42),
    applicationDeadline: daysAheadIso(28),
    targetGrades: ['Brown (4th Kyu)', 'Brown-Gold (3rd Kyu)', 'Black (2nd Kyu)'],
    status: 'open',
  },
  {
    id: 'opportunity-summer-jurong',
    title: "Summer children's grading — Jurong",
    centreId: 'centre-jeas',
    instructorId: 'instructor-sato',
    gradingType: 'children',
    date: daysAgoIso(30),
    applicationDeadline: daysAgoIso(44),
    targetGrades: ['Brown (4th Kyu)'],
    status: 'closed',
  },
]

function takeStudentForGrade(
  targetGrade: Grade,
  track: GradeTrack,
  centreId?: string,
  index = 0,
): string {
  const candidates = students.filter((student) => {
    const age = yearAgeFromIso(student.dateOfBirth)
    return (
      gradeTrackForAge(age) === track &&
      nextGrade(student.currentGrade, track, age) === targetGrade
    )
  })
  // Prefer the requested centre, but keep the mock application on a student who
  // actually targets this grade (e.g. an away student withdrawing).
  const scoped = centreId
    ? candidates.filter((student) => student.homeCentreId === centreId)
    : candidates
  const matches = scoped.length > 0 ? scoped : candidates
  return matches[index % Math.max(matches.length, 1)]?.id ?? students[0].id
}

export const applications: GradingApplication[] = [
  {
    id: 'application-001',
    studentId: takeStudentForGrade(
      'Brown-Silver (4th Kyu)',
      'children',
      'centre-btcc',
    ),
    opportunityId: 'opportunity-autumn-bukit-timah',
    targetGrade: 'Brown-Silver (4th Kyu)',
    submittedAt: daysAgoIso(4),
    status: 'submitted',
    notes: 'Attending Tuesday and Thursday sessions.',
  },
  {
    id: 'application-002',
    studentId: takeStudentForGrade('Black (2nd Kyu)', 'children', 'centre-btcc'),
    opportunityId: 'opportunity-autumn-bukit-timah',
    targetGrade: 'Black (2nd Kyu)',
    submittedAt: daysAgoIso(6),
    status: 'under_review',
  },
  {
    id: 'application-003',
    studentId: takeStudentForGrade('Purple (7th Kyu)', 'children', 'centre-cycc'),
    opportunityId: 'opportunity-autumn-serangoon',
    targetGrade: 'Purple (7th Kyu)',
    submittedAt: daysAgoIso(8),
    status: 'submitted',
  },
  {
    id: 'application-004',
    studentId: takeStudentForGrade('Purple (7th Kyu)', 'children', 'centre-tgpc'),
    opportunityId: 'opportunity-autumn-serangoon',
    targetGrade: 'Purple (7th Kyu)',
    submittedAt: daysAgoIso(5),
    status: 'withdrawn',
    notes: 'Withdrawn — unable to attend the Ci Yuan date.',
  },
  {
    id: 'application-005',
    studentId: takeStudentForGrade('Brown (4th Kyu)', 'adult', 'centre-oth'),
    opportunityId: 'opportunity-winter-tampines',
    targetGrade: 'Brown (4th Kyu)',
    submittedAt: daysAgoIso(9),
    status: 'submitted',
  },
  {
    id: 'application-006',
    studentId: takeStudentForGrade('Brown-Gold (3rd Kyu)', 'adult', 'centre-oth'),
    opportunityId: 'opportunity-winter-tampines',
    targetGrade: 'Brown-Gold (3rd Kyu)',
    submittedAt: daysAgoIso(12),
    status: 'under_review',
  },
  {
    id: 'application-007',
    studentId: takeStudentForGrade('Black (2nd Kyu)', 'adult', 'centre-oth'),
    opportunityId: 'opportunity-winter-tampines',
    targetGrade: 'Black (2nd Kyu)',
    submittedAt: daysAgoIso(2),
    status: 'submitted',
    notes: 'First grading attempt.',
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
    audience: 'Ci Yuan — all students',
    recipientCount: 9,
    sentAt: `${daysAgoIso(8)}T08:05:00`,
    deliveredCount: 9,
    failedCount: 0,
  },
  {
    id: 'notification-004',
    channel: 'email',
    template: 'Grading invitation',
    audience: 'Eligible students — Ci Yuan',
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
  techniqueSignOffs,
  sessions,
  attendance,
  opportunities,
  applications,
  notifications,
}

export type AdminData = typeof initialAdminData
