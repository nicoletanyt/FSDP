// Create (or remove) one test class with pre-enrolled test students.
//
//   npm run seed:class -- --help
//   npm run seed:class -- --datetime "2026-11-25T18:00" --students 5 --capacity 8
//   npm run seed:class -- --datetime "2026-11-25T18:00" --instructor coach@example.com --students 10
//   npm run seed:class -- --datetime "2026-11-25T18:00" --remove
//
// Enrols existing students only (Jamie Lim, Avery Tan, Riley Ong); it never creates or deletes students.
//
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env.
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const uuidNamespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex')

// Single source of truth for --help, parseArgs and defaults.
export const OPTIONS = [
  { name: 'datetime', type: 'string', required: true, hint: 'ISO', desc: 'Class start. No offset means Singapore time (+08:00).', example: '"2026-11-25T18:00"' },
  { name: 'students', type: 'string', required: true, hint: '1-3', desc: 'Enrol the first N of Jamie Lim, Avery Tan, Riley Ong (existing students). Not needed with --remove.', example: '5' },
  { name: 'capacity', type: 'string', default: '20', hint: 'int', desc: 'Class size (classes.booking_capacity). Must be >= --students.', example: '8' },
  { name: 'duration', type: 'string', default: '60', hint: 'minutes', desc: 'Class length in minutes.', example: '90' },
  { name: 'instructor', type: 'string', hint: 'email', desc: 'Instructor login email. Unassigned if omitted.', example: 'coach@example.com' },
  { name: 'centre', type: 'string', hint: 'short_name', desc: 'Centre short_name. Defaults to the first active centre.', example: 'HQ' },
  { name: 'class-type', type: 'string', default: 'adults', hint: 'id', desc: 'class_types.id (adults, children-beginners, weapons, mixed-family, ...).', example: 'weapons' },
  { name: 'remove', type: 'boolean', desc: 'Delete the class at --datetime, and its enrolments. Students are never deleted.' },
  { name: 'help', short: 'h', type: 'boolean', desc: 'Show this help.' },
]

export function usage() {
  const rows = OPTIONS.map(option => {
    const flag = `--${option.name}${option.hint ? ` <${option.hint}>` : ''}`
    const meta = option.required ? 'REQUIRED' : option.default ? `default: ${option.default}` : 'optional'
    return `  ${flag.padEnd(26)} ${meta.padEnd(14)} ${option.desc}`
  })
  return ['Usage: npm run seed:class -- --datetime <ISO> --students <1-3> [options]', '', ...rows, '',
    'Example:', '  npm run seed:class -- --datetime "2026-11-25T18:00" --students 5 --capacity 8'].join('\n')
}

// The predefined existing students with logins (looked up by email). --students N enrols the first N.
export const TEST_STUDENT_EMAILS = ['jamie.lim@example.test', 'avery.tan@example.test', 'riley.ong@example.test']
export const MAX_TEST_STUDENTS = TEST_STUDENT_EMAILS.length

export function fixtureId(key) {
  const bytes = createHash('sha1').update(uuidNamespace).update(`fsdp/test-class/v1/${key}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function parseStart(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('--datetime is required.')
  const text = value.trim()
  const local = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(text)
  const date = new Date(local ? `${text.replace(' ', 'T')}${text.length === 16 ? ':00' : ''}+08:00` : text)
  if (!Number.isFinite(date.getTime())) throw new Error('--datetime is not a valid date. Use e.g. "2026-11-25T18:00".')
  return date
}

export function integer(value, flag, min, max) {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < min || (max && Number(value) > max)) {
    throw new Error(`--${flag} must be an integer from ${min}${max ? ` to ${max}` : ' up'}.`)
  }
  return Number(value)
}

export function validateArgs(values) {
  const startsAt = parseStart(values.datetime)
  const remove = Boolean(values.remove)
  const students = remove && values.students === undefined ? 0 : integer(values.students, 'students', 1, MAX_TEST_STUDENTS)
  const capacity = integer(values.capacity ?? '20', 'capacity', 1)
  const duration = integer(values.duration ?? '60', 'duration', 1)
  if (!remove && capacity < students) throw new Error(`--capacity (${capacity}) must be at least --students (${students}).`)
  return { startsAt, endsAt: new Date(startsAt.getTime() + duration * 60_000), students, capacity, remove,
    instructorEmail: values.instructor?.trim().toLowerCase(), centre: values.centre?.trim(), classType: values['class-type'] ?? 'adults' }
}

export const testClassId = startsAt => fixtureId(`class/${startsAt.toISOString()}`)

export function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} in the root .env.`)
  return value
}

export function checked(result, operation) {
  if (result.error) throw new Error(`${operation} failed${result.error.code ? ` (${result.error.code})` : ''}: ${result.error.message}`)
  return result.data
}

export async function createTestClass(values) {
  const args = validateArgs(values)
  const project = new URL(requiredEnv('VITE_SUPABASE_URL')).origin
  const db = createClient(project, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const eventId = testClassId(args.startsAt)

  if (args.remove) {
    // The ID is a name-based UUIDv5 of the start time, so only this script's class can have it.
    const existing = checked(await db.from('events').select('id').eq('id', eventId).maybeSingle(), 'Class lookup')
    checked(await db.from('event_students').delete().eq('event_id', eventId), 'Roster cleanup')
    checked(await db.from('classes').delete().eq('event_id', eventId), 'Class cleanup')
    checked(await db.from('events').delete().eq('id', eventId), 'Event cleanup')
    return { removedClass: Boolean(existing), eventId }
  }

  const [centres, classType, instructor] = await Promise.all([
    (args.centre ? db.from('centres').select('id,name,short_name').eq('short_name', args.centre)
      : db.from('centres').select('id,name,short_name').eq('status', 'active').order('name').limit(1)),
    db.from('class_types').select('id,label').eq('id', args.classType).maybeSingle(),
    args.instructorEmail ? db.from('instructors').select('id,email').eq('email', args.instructorEmail).maybeSingle() : { data: null },
  ])
  const centre = checked(centres, 'Centre lookup')[0]
  if (!centre) throw new Error(args.centre ? `No centre has short_name "${args.centre}".` : 'An existing active centre is required.')
  const classTypeRow = checked(classType, 'Class-type lookup')
  if (!classTypeRow) throw new Error(`No class type "${args.classType}". Check class_types.id.`)
  const instructorRow = checked(instructor, 'Instructor lookup')
  if (args.instructorEmail && !instructorRow) throw new Error('No instructor record matches that email.')

  const wanted = TEST_STUDENT_EMAILS.slice(0, args.students)
  const found = checked(await db.from('students').select('id,email').in('email', wanted), 'Student lookup')
  const missing = wanted.filter(email => !found.some(row => row.email === email))
  if (missing.length) throw new Error(`These existing students were not found: ${missing.join(', ')}.`)

  const event = { id: eventId, event_type: 'class', centre_id: centre.id, instructor_id: instructorRow?.id ?? null,
    name: classTypeRow.label, starts_at: args.startsAt.toISOString(),
    ends_at: args.endsAt.toISOString(), status: 'scheduled' }
  checked(await db.from('events').upsert(event, { onConflict: 'id' }), 'Event insertion')
  checked(await db.from('classes').upsert({ event_id: eventId, class_type_id: args.classType, booking_capacity: args.capacity },
    { onConflict: 'event_id' }), 'Class insertion')
  const roster = found.map(row => ({ event_id: eventId, student_id: row.id }))
  checked(await db.from('event_students').upsert(roster, { onConflict: 'event_id,student_id', ignoreDuplicates: true }), 'Roster insertion')

  const enrolled = checked(await db.from('event_students').select('student_id').eq('event_id', eventId), 'Roster verification').length
  return { project, eventId, startsAt: event.starts_at, endsAt: event.ends_at, centre: centre.name, classType: args.classType,
    instructor: instructorRow?.email ?? null, capacity: args.capacity, enrolled,
    students: found.map(row => row.email).sort(), spotsLeft: args.capacity - enrolled }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(OPTIONS.map(({ name, type, short }) => [name, { type, ...(short && { short }) }])) })
    if (values.help) console.log(usage())
    else console.log(JSON.stringify(await createTestClass(values), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Test class creation failed.')
    console.error(`\n${usage()}`)
    process.exitCode = 1
  }
}
