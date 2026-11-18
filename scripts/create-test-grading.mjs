// Create (or remove) one test grading with a default chief examiner, examiner and applicants.
//
//   npm run seed:grading -- --help
//   npm run seed:grading -- --datetime "2026-11-28T10:00" --students 3
//   npm run seed:grading -- --datetime "2026-11-28T10:00" --remove
//
// Chief examiner: ethan.chua@example.test. Examiner: nadia.wong@example.test.
// Applicants are existing students (same as seed:class); it never creates or deletes students.
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env.
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { MAX_TEST_STUDENTS, TEST_STUDENT_EMAILS, checked, fixtureId, integer, parseStart, requiredEnv } from './create-test-class.mjs'
import { nextGrade, singaporeDate, trackForStudent } from './seed-grading-sessions.mjs'

export const CHIEF_EXAMINER_EMAIL = 'ethan.chua@example.test'
export const EXAMINER_EMAIL = 'nadia.wong@example.test'
const dayMilliseconds = 86_400_000

export const OPTIONS = [
  { name: 'datetime', type: 'string', required: true, hint: 'ISO', desc: 'Grading start. No offset means Singapore time (+08:00).' },
  { name: 'students', type: 'string', required: true, hint: '1-3', desc: 'Applicants: the first N of Jamie Lim, Avery Tan, Riley Ong. Not needed with --remove.' },
  { name: 'duration', type: 'string', default: '180', hint: 'minutes', desc: 'Grading length in minutes.' },
  { name: 'centre', type: 'string', hint: 'short_name', desc: 'Centre short_name. Defaults to headquarters, else the first active centre.' },
  { name: 'remove', type: 'boolean', desc: 'Delete the grading at --datetime (applicants, panel and roster go with it).' },
  { name: 'help', short: 'h', type: 'boolean', desc: 'Show this help.' },
]

export function usage() {
  const rows = OPTIONS.map(option => {
    const flag = `--${option.name}${option.hint ? ` <${option.hint}>` : ''}`
    const meta = option.required ? 'REQUIRED' : option.default ? `default: ${option.default}` : 'optional'
    return `  ${flag.padEnd(26)} ${meta.padEnd(14)} ${option.desc}`
  })
  return ['Usage: npm run seed:grading -- --datetime <ISO> --students <1-3> [options]', '', ...rows, '',
    'Example:', '  npm run seed:grading -- --datetime "2026-11-28T10:00" --students 3'].join('\n')
}

export function validateArgs(values) {
  const startsAt = parseStart(values.datetime)
  const remove = Boolean(values.remove)
  const students = remove && values.students === undefined ? 0 : integer(values.students, 'students', 1, MAX_TEST_STUDENTS)
  const duration = integer(values.duration ?? '180', 'duration', 1)
  return { startsAt, endsAt: new Date(startsAt.getTime() + duration * 60_000), students, remove, centre: values.centre?.trim() }
}

export const testGradingId = startsAt => fixtureId(`grading/${startsAt.toISOString()}`)

const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * dayMilliseconds).toISOString().slice(0, 10)
const showDate = date => new Date(`${date}T00:00:00+08:00`)
  .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })

// Rows for one adult grading, shaped like buildGradingSessionPlan() in seed-grading-sessions.mjs.
export function buildTestGradingPlan({ id, startsAt, endsAt, centreId, chiefId, examinerId, gradeTracks, students, grades, today = singaporeDate() }) {
  const track = 'adult'
  const date = singaporeDate(startsAt)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' }).format(startsAt)
  const targets = gradeTracks.filter(row => row.track === track).map(row => ({ grading_event_id: id, grade_id: row.grade_id }))
  const applicants = students.map(student => {
    if (trackForStudent(student.date_of_birth, date) !== track) throw new Error(`${student.email} is not an adult, so cannot apply to an adult grading.`)
    const target = nextGrade(student.current_grade_id, track, grades, gradeTracks)
    if (!target) throw new Error(`${student.email} has no next adult grade to apply for.`)
    return { email: student.email, student_id: student.id, target_grade_id: target }
  })
  return {
    event: { id, event_type: 'grading', centre_id: centreId, instructor_id: chiefId, status: 'scheduled',
      name: `Adult grading — ${showDate(date)}`, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() },
    grading: { event_id: id, track, official_schedule: true, grading_date: date, application_status: 'open',
      application_opens_on: addDays(today, -14), application_deadline: addDays(date, -1),
      reporting_release_on: addDays(date, -2), reporting_time: `${time}:00` },
    targets,
    panel: [{ grading_event_id: id, instructor_id: chiefId, is_chief: true }, { grading_event_id: id, instructor_id: examinerId, is_chief: false }],
    roster: applicants.map(row => ({ event_id: id, student_id: row.student_id })),
    applications: applicants.map(row => ({ student_id: row.student_id, grading_event_id: id, target_grade_id: row.target_grade_id, status: 'submitted' })),
    applicants,
  }
}

export async function createTestGrading(values) {
  const args = validateArgs(values)
  const project = new URL(requiredEnv('VITE_SUPABASE_URL')).origin
  const db = createClient(project, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const id = testGradingId(args.startsAt)

  if (args.remove) {
    // The ID is a name-based UUIDv5 of the start time, so only this script's grading can have it.
    const existing = checked(await db.from('events').select('id').eq('id', id).eq('event_type', 'grading').maybeSingle(), 'Grading lookup')
    // Cascades to the grading, target grades, roster, applications and panel.
    checked(await db.from('events').delete().eq('id', id).eq('event_type', 'grading'), 'Grading cleanup')
    return { removedGrading: Boolean(existing), eventId: id }
  }

  const wanted = TEST_STUDENT_EMAILS.slice(0, args.students)
  const [centreResult, examinerResult, trackResult, gradeResult, studentResult] = await Promise.all([
    args.centre ? db.from('centres').select('id,name').eq('short_name', args.centre)
      : db.from('centres').select('id,name').eq('status', 'active').order('name'),
    db.from('instructors').select('id,email,first_name,last_name,is_examiner,user_id,users(role)').in('email', [CHIEF_EXAMINER_EMAIL, EXAMINER_EMAIL]),
    db.from('grade_tracks').select('grade_id,track'),
    db.from('grades').select('id,sort_order'),
    db.from('students').select('id,email,date_of_birth,current_grade_id').in('email', wanted),
  ])
  const centres = checked(centreResult, 'Centre lookup')
  const centre = args.centre ? centres[0] : centres.find(row => /headquarters/i.test(row.name)) ?? centres[0]
  if (!centre) throw new Error(args.centre ? `No centre has short_name "${args.centre}".` : 'An existing active centre is required.')
  const examiners = checked(examinerResult, 'Examiner lookup')
  const find = email => {
    const row = examiners.find(item => item.email === email)
    if (!row) throw new Error(`No instructor record matches ${email}.`)
    if (!row.is_examiner || [row.users].flat()[0]?.role !== 'instructor') throw new Error(`${email} must be an examiner with an instructor login.`)
    return row
  }
  const chief = find(CHIEF_EXAMINER_EMAIL)
  const examiner = find(EXAMINER_EMAIL)
  const students = checked(studentResult, 'Student lookup')
  const missing = wanted.filter(email => !students.some(row => row.email === email))
  if (missing.length) throw new Error(`These existing students were not found: ${missing.join(', ')}.`)

  const plan = buildTestGradingPlan({ id, startsAt: args.startsAt, endsAt: args.endsAt, centreId: centre.id, chiefId: chief.id,
    examinerId: examiner.id, gradeTracks: checked(trackResult, 'Grade-track lookup'), grades: checked(gradeResult, 'Grade lookup'),
    students: wanted.map(email => students.find(row => row.email === email)) })

  checked(await db.from('events').upsert(plan.event, { onConflict: 'id' }), 'Event insertion')
  checked(await db.from('gradings').upsert(plan.grading, { onConflict: 'event_id' }), 'Grading insertion')
  checked(await db.from('grading_target_grades').upsert(plan.targets, { onConflict: 'grading_event_id,grade_id', ignoreDuplicates: true }), 'Target-grade insertion')
  checked(await db.from('grading_panel_members').upsert(plan.panel, { onConflict: 'grading_event_id,instructor_id' }), 'Panel insertion')
  checked(await db.from('event_students').upsert(plan.roster, { onConflict: 'event_id,student_id', ignoreDuplicates: true }), 'Roster insertion')
  checked(await db.from('grading_applications').upsert(plan.applications, { onConflict: 'student_id,grading_event_id', ignoreDuplicates: true }), 'Application insertion')

  const applications = checked(await db.from('grading_applications').select('student_id').eq('grading_event_id', id), 'Application verification')
  return { project, eventId: id, name: plan.event.name, startsAt: plan.event.starts_at, endsAt: plan.event.ends_at, centre: centre.name,
    chiefExaminer: CHIEF_EXAMINER_EMAIL, examiner: EXAMINER_EMAIL, applications: applications.length,
    applicants: plan.applicants.map(row => ({ email: row.email, targetGrade: row.target_grade_id })) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(OPTIONS.map(({ name, type, short }) => [name, { type, ...(short && { short }) }])) })
    if (values.help) console.log(usage())
    else console.log(JSON.stringify(await createTestGrading(values), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Test grading creation failed.')
    console.error(`\n${usage()}`)
    process.exitCode = 1
  }
}
