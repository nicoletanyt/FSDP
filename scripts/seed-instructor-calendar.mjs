import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const CALENDAR_TEST_PREFIX = '[Calendar Test] '
const uuidNamespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex')
const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const preferredTypes = ['mixed-family', 'adults', 'children-beginners', 'weapons', 'mixed-family', 'adults', 'children-juniors']
const preferredHours = [18, 18, 17, 19, 18, 10, 11]
const dayMilliseconds = 86_400_000

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a date in YYYY-MM-DD format.')
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Use a valid calendar date.')
  return date
}

export function singaporeDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function calendarSeedWeek(weekOf = singaporeDate()) {
  const date = dateOnly(weekOf)
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  const days = Array.from({ length: 7 }, (_, index) => new Date(date.getTime() + index * dayMilliseconds).toISOString().slice(0, 10))
  return { days, from: days[0], to: new Date(date.getTime() + 7 * dayMilliseconds).toISOString().slice(0, 10) }
}

// Standard name-based UUID v5: repeats for the same instructor/week/day and is
// never confused with an existing auth-user, instructor or student identity.
export function calendarSeedId(instructorId, weekStart, dayIndex) {
  const bytes = createHash('sha1').update(uuidNamespace)
    .update(`fsdp/calendar-test/v1/${instructorId}/${weekStart}/${dayIndex}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function assertCalendarSeedOwnership(events, instructorId) {
  if (events.some(event => event.instructor_id !== instructorId || event.event_type !== 'class'
      || !event.name.startsWith(CALENDAR_TEST_PREFIX))) {
    throw new Error('A fixture ID belongs to a different event. No existing event will be overwritten.')
  }
}

function stamp(date, hour) {
  return `${date}T${String(hour).padStart(2, '0')}:00:00+08:00`
}

function overlaps(start, end, blocker) {
  return blocker.starts_at && blocker.ends_at && blocker.status !== 'cancelled'
    && Date.parse(blocker.starts_at) < Date.parse(end) && Date.parse(blocker.ends_at) > Date.parse(start)
}

export function buildCalendarSeedPlan({ instructorId, centres, classTypes, weekOf, now = new Date(), existingEvents = [], availability = [] }) {
  const week = calendarSeedWeek(weekOf)
  const activeCentres = centres.filter(centre => centre.status === 'active').sort((a, b) =>
    Number(b.capacity !== null) - Number(a.capacity !== null) || a.name.localeCompare(b.name))
  if (!activeCentres.length) throw new Error('An existing active centre is required.')
  if (!classTypes.length) throw new Error('An existing class type is required.')
  const ids = week.days.map((_, index) => calendarSeedId(instructorId, week.from, index))
  const saved = existingEvents.filter(event => ids.includes(event.id))
  assertCalendarSeedOwnership(saved, instructorId)
  const blockers = existingEvents.filter(event => !ids.includes(event.id))
  const slots = availability.map(slot => ({
    starts_at: `${slot.date}T${slot.start_time}+08:00`, ends_at: `${slot.date}T${slot.end_time}+08:00`, status: 'scheduled',
  }))
  const events = week.days.map((date, index) => {
    const existing = saved.find(event => event.id === ids[index])
    if (existing) return existing
    const classType = classTypes.find(type => type.id === preferredTypes[index]) ?? classTypes[index % classTypes.length]
    const candidates = [...new Set([preferredHours[index], ...Array.from({ length: 14 }, (_, offset) => 8 + offset)])]
    const hour = candidates.find(value => ![...blockers, ...slots].some(blocker => overlaps(stamp(date, value), stamp(date, value + 1), blocker)))
    if (hour === undefined) throw new Error(`No free one-hour test slot exists on ${date}.`)
    const startsAt = stamp(date, hour)
    const endsAt = stamp(date, hour + 1)
    return { id: ids[index], event_type: 'class', centre_id: activeCentres[index % Math.min(3, activeCentres.length)].id,
      instructor_id: instructorId, name: `${CALENDAR_TEST_PREFIX}${classType.label} — ${dayNames[index]}`,
      starts_at: startsAt, ends_at: endsAt, status: Date.parse(endsAt) <= now.getTime() ? 'completed' : 'scheduled' }
  })
  return { ...week, ids, events }
}

export function buildCalendarSeedRoster(event, students, classTypeId, now = new Date(), empty = false) {
  if (empty) return []
  const year = Number(singaporeDate(new Date(event.starts_at)).slice(0, 4))
  const members = students.filter(student => {
    const age = year - Number(student.date_of_birth.slice(0, 4))
    return classTypeId.startsWith('children-') || classTypeId === 'kids' ? age >= 0 && age < 13
      : classTypeId === 'adults' || classTypeId === 'weapons' ? age >= 13 : true
  }).slice(0, 6)
  const past = Date.parse(event.ends_at) <= now.getTime()
  return members.map((student, index) => {
    const status = past ? ['present', 'late', 'absent', 'excused', null, 'present'][index] : null
    const arrived = status === 'present' || status === 'late'
      ? new Date(Date.parse(event.starts_at) + (status === 'late' ? 8 : 2) * 60_000).toISOString() : null
    return { event_id: event.id, student_id: student.id, attendance_status: status,
      recorded_at: arrived ?? (status ? event.ends_at : null), checked_in_at: arrived,
      assessment_status: null, assessment_notes: null }
  })
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} in the root .env.`)
  return value
}

function checked(result, operation) {
  if (result.error) throw new Error(`${operation} failed${result.error.code ? ` (${result.error.code})` : ''}.`)
  return result.data
}

export async function seedInstructorCalendar({ email, weekOf = singaporeDate(), dryRun = false, remove = false }) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Provide --instructor-email with the instructor login email.')
  const project = new URL(requiredEnv('VITE_SUPABASE_URL')).origin
  const db = createClient(project, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const instructor = checked(await db.from('instructors').select('id,user_id,email')
    .eq('email', email.trim().toLowerCase()).maybeSingle(), 'Instructor lookup')
  if (!instructor) throw new Error('No instructor record matches that email.')
  const week = calendarSeedWeek(weekOf)
  const ids = week.days.map((_, index) => calendarSeedId(instructor.id, week.from, index))
  const eventColumns = 'id,event_type,centre_id,instructor_id,name,starts_at,ends_at,status'
  const existingFixtures = checked(await db.from('events').select(eventColumns).in('id', ids), 'Fixture lookup')
  assertCalendarSeedOwnership(existingFixtures, instructor.id)
  if (remove) {
    const deleted = dryRun ? existingFixtures : checked(await db.from('events').delete().in('id', ids)
      .eq('instructor_id', instructor.id).like('name', `${CALENDAR_TEST_PREFIX}%`).select('id'), 'Fixture cleanup')
    return { project, instructorEmail: instructor.email, weekStart: week.from, dryRun,
      ...(dryRun ? { wouldRemoveEvents: deleted.length } : { removedEvents: deleted.length }) }
  }
  if (!instructor.user_id) throw new Error('The instructor must be linked to the account you will sign in with.')
  const profile = checked(await db.from('users').select('role').eq('id', instructor.user_id).single(), 'Role lookup')
  if (profile.role !== 'instructor') throw new Error('The linked account must have the instructor role.')
  const [centreResult, typeResult, studentResult, eventResult, availabilityResult] = await Promise.all([
    db.from('centres').select('id,name,status,capacity').eq('status', 'active').order('name'),
    db.from('class_types').select('id,label').order('id'),
    db.from('students').select('id,date_of_birth,member_no').eq('membership_status', 'active').order('member_no').limit(50),
    db.from('events').select(eventColumns).eq('instructor_id', instructor.id)
      .lt('starts_at', `${week.to}T00:00:00+08:00`).gt('ends_at', `${week.from}T00:00:00+08:00`),
    db.from('instructor_availability').select('date,start_time,end_time').eq('instructor_id', instructor.id).gte('date', week.from).lt('date', week.to),
  ])
  const centres = checked(centreResult, 'Centre lookup')
  const classTypes = checked(typeResult, 'Class-type lookup')
  const students = checked(studentResult, 'Student lookup')
  if (!students.length) throw new Error('Existing active student records are required for test rosters.')
  const now = new Date()
  const existingEvents = checked(eventResult, 'Calendar lookup')
  const availability = checked(availabilityResult, 'Availability lookup')
  const plan = buildCalendarSeedPlan({ instructorId: instructor.id, centres, classTypes, weekOf, now,
    existingEvents: [...existingEvents.filter(event => !ids.includes(event.id)), ...existingFixtures], availability })
  const classes = plan.events.map((event, index) => ({ event_id: event.id,
    class_type_id: (classTypes.find(type => type.id === preferredTypes[index]) ?? classTypes[index % classTypes.length]).id }))
  if (dryRun) return { project, instructorEmail: instructor.email, weekStart: plan.from, weekEndExclusive: plan.to,
    dryRun, events: plan.events.map(event => ({ ...event, centre: centres.find(centre => centre.id === event.centre_id)?.name })) }

  // Each REST batch is atomic. Ignore existing fixture rows, and heal missing
  // subtype/roster batches on rerun without resetting recorded attendance/notes.
  const insertedEvents = checked(await db.from('events').upsert(plan.events, { onConflict: 'id', ignoreDuplicates: true }).select('id'), 'Event insertion')
  checked(await db.from('classes').upsert(classes, { onConflict: 'event_id', ignoreDuplicates: true }), 'Class insertion')
  const savedEvents = checked(await db.from('events').select(`${eventColumns},classes(class_type_id)`).in('id', ids), 'Saved-event lookup')
  const existingRoster = checked(await db.from('event_students').select('event_id,student_id').in('event_id', ids), 'Roster lookup')
  const populated = new Set(existingRoster.map(row => row.event_id))
  const roster = savedEvents.flatMap(event => populated.has(event.id) ? [] : buildCalendarSeedRoster(event, students,
    event.classes?.class_type_id ?? classes.find(row => row.event_id === event.id).class_type_id, now, event.id === ids[6]))
  if (roster.length) checked(await db.from('event_students').upsert(roster, { onConflict: 'event_id,student_id', ignoreDuplicates: true }), 'Roster insertion')

  const verifiedEvents = checked(await db.from('events').select(`${eventColumns},centre:centres(name),classes(class_type_id),participants:event_students(count)`)
    .in('id', ids).order('starts_at'), 'Calendar verification')
  const verifiedRoster = checked(await db.from('event_students').select('event_id,student_id,attendance_status,checked_in_at')
    .in('event_id', ids), 'Attendance verification')
  assertCalendarSeedOwnership(verifiedEvents, instructor.id)
  if (verifiedEvents.length !== 7 || verifiedEvents.some(event => !event.classes || !event.centre)
      || (!populated.has(ids[6]) && verifiedRoster.some(row => row.event_id === ids[6]))) throw new Error('Calendar fixture verification failed.')
  const today = singaporeDate(now)
  return { project, instructorEmail: instructor.email, instructorId: instructor.id, weekStart: plan.from, weekEndExclusive: plan.to,
    createdEvents: insertedEvents.length,
    totalEvents: verifiedEvents.length, classRows: verifiedEvents.length, rosterRows: verifiedRoster.length,
    calendarPath: `/instructor/calendar?view=week&date=${today >= plan.from && today < plan.to ? today : plan.from}`,
    events: verifiedEvents.map(event => ({ id: event.id, name: event.name, startsAt: event.starts_at, endsAt: event.ends_at,
      status: event.status, centre: event.centre.name, students: event.participants[0].count })),
    attendanceCounts: Object.fromEntries([null, 'present', 'late', 'absent', 'excused'].map(status =>
      [status ?? 'unmarked', verifiedRoster.filter(row => row.attendance_status === status).length])),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: {
      'instructor-email': { type: 'string' }, 'week-of': { type: 'string' },
      'dry-run': { type: 'boolean', default: false }, remove: { type: 'boolean', default: false },
    } })
    console.log(JSON.stringify(await seedInstructorCalendar({ email: values['instructor-email'], weekOf: values['week-of'],
      dryRun: values['dry-run'], remove: values.remove }), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Calendar seed failed.')
    process.exitCode = 1
  }
}
