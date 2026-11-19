// Create a login account: student, instructor or administrator.
//
//   npm run seed:account -- --help
//   npm run seed:account -- --username sam --password "Secret123"
//   npm run seed:account -- --username coach --role instructor --examiner --full-time
//
// --username is the login email. A bare name like "sam" becomes sam@example.test.
// Instructor flags are all optional: --examiner, --chief-examiner, --part-time, --full-time.
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env.
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { checked, requiredEnv } from './create-test-class.mjs'

export const DEFAULT_PASSWORD = 'TestPass123'
export const ROLES = ['student', 'instructor', 'administrator']
const INSTRUCTOR_FLAGS = ['examiner', 'chief-examiner', 'part-time', 'full-time']

export const OPTIONS = [
  { name: 'username', type: 'string', required: true, hint: 'name|email', desc: 'Login email. A bare name becomes <name>@example.test.' },
  { name: 'password', type: 'string', default: DEFAULT_PASSWORD, hint: 'text', desc: '8-128 characters with a letter and a number.' },
  { name: 'role', type: 'string', default: 'student', hint: ROLES.join('|'), desc: 'Account role.' },
  { name: 'name', type: 'string', hint: '"First Last"', desc: 'Display name. Default: the username, with last name "Test".' },
  { name: 'examiner', type: 'boolean', desc: 'Instructor only: may sit on grading panels.' },
  { name: 'chief-examiner', type: 'boolean', desc: 'Instructor only: same as --examiner. Chief is set per grading in the admin panel.' },
  { name: 'part-time', type: 'boolean', desc: 'Instructor only: employment type part-time.' },
  { name: 'full-time', type: 'boolean', desc: 'Instructor only: employment type full-time.' },
  { name: 'help', short: 'h', type: 'boolean', desc: 'Show this help.' },
]

export function usage() {
  const rows = OPTIONS.map(option => {
    const flag = `--${option.name}${option.hint ? ` <${option.hint}>` : ''}`
    const meta = option.required ? 'REQUIRED' : option.default ? `default: ${option.default}` : 'optional'
    return `  ${flag.padEnd(34)} ${meta.padEnd(22)} ${option.desc}`
  })
  return ['Usage: npm run seed:account -- --username <name|email> [options]', '', ...rows, '',
    'Examples:', '  npm run seed:account -- --username sam --password "Secret123"',
    '  npm run seed:account -- --username coach --role instructor --examiner --full-time'].join('\n')
}

export function validateArgs(values) {
  const raw = values.username?.trim().toLowerCase()
  if (!raw) throw new Error('--username is required.')
  const email = raw.includes('@') ? raw : `${raw}@example.test`
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--username must be a name like "sam" or a valid email address.')
  const password = values.password ?? DEFAULT_PASSWORD
  if (password.length < 8 || password.length > 128 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error('--password must contain 8-128 characters and at least one letter and one number.')
  }
  const role = values.role ?? 'student'
  if (!ROLES.includes(role)) throw new Error(`--role must be one of: ${ROLES.join(', ')}.`)
  const used = INSTRUCTOR_FLAGS.filter(flag => values[flag])
  if (role !== 'instructor' && used.length) throw new Error(`--${used[0]} only applies to --role instructor.`)
  if (values['part-time'] && values['full-time']) throw new Error('Choose either --part-time or --full-time, not both.')
  const local = email.split('@')[0]
  const [first, ...rest] = (values.name?.trim() || '').split(/\s+/).filter(Boolean)
  const firstName = (first ?? `${local.charAt(0).toUpperCase()}${local.slice(1)}`).slice(0, 100)
  const lastName = (rest.join(' ') || 'Test').slice(0, 100)
  return { email, password, role, firstName, lastName,
    isExaminer: Boolean(values.examiner || values['chief-examiner']),
    employmentType: values['part-time'] ? 'part_time' : values['full-time'] ? 'full_time' : null }
}

export async function createAccount(values) {
  const args = validateArgs(values)
  const project = new URL(requiredEnv('VITE_SUPABASE_URL')).origin
  const db = createClient(project, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const centre = args.role === 'student'
    ? checked(await db.from('centres').select('id').eq('status', 'active').order('name').limit(1), 'Centre lookup')[0] : null
  if (args.role === 'student' && !centre) throw new Error('An existing active centre is required.')

  // Role comes only from app_metadata; the database triggers create public.users (and the instructor row).
  const appMetadata = args.role === 'instructor' ? { role: 'instructor', instructor_title: 'none', instructor_is_examiner: args.isExaminer }
    : args.role === 'administrator' ? { role: 'administrator' } : {}
  const { data, error } = await db.auth.admin.createUser({ email: args.email, password: args.password, email_confirm: true,
    user_metadata: { first_name: args.firstName, last_name: args.lastName }, app_metadata: appMetadata })
  if (error || !data.user) throw new Error(`Creating the account failed: ${error?.message ?? 'unknown error'}. Is the email already registered?`)
  const userId = data.user.id

  const profile = checked(await db.from('users').select('role').eq('id', userId).single(), 'Profile lookup')
  if (profile.role !== args.role) throw new Error(`The account was created, but its profile role is "${profile.role}". Check the migrations.`)
  const result = { email: args.email, password: args.password, role: args.role, name: `${args.firstName} ${args.lastName}` }

  if (args.role === 'instructor') {
    if (args.employmentType) checked(await db.from('instructors').update({ employment_type: args.employmentType }).eq('user_id', userId), 'Employment update')
    const instructor = checked(await db.from('instructors').select('id,is_examiner,employment_type').eq('user_id', userId).single(), 'Instructor lookup')
    Object.assign(result, { instructorId: instructor.id, examiner: instructor.is_examiner, employmentType: instructor.employment_type ?? 'unspecified' })
  }
  if (args.role === 'student') {
    // Pending, as after a membership application; run seed:membership to activate.
    const id = randomUUID()
    checked(await db.from('students').insert({ id, user_id: userId, member_no: id, first_name: args.firstName, last_name: args.lastName,
      email: args.email, home_centre_id: centre.id, date_of_birth: '1995-01-01', joined_at: new Date().toISOString().slice(0, 10),
      membership_status: 'pending' }), 'Student insertion')
    Object.assign(result, { studentId: id, membershipStatus: 'pending', next: `npm run seed:membership -- --student ${args.email}` })
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(OPTIONS.map(({ name, type, short }) => [name, { type, ...(short && { short }) }])) })
    if (values.help) console.log(usage())
    else console.log(JSON.stringify(await createAccount(values), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Account creation failed.')
    console.error(`\n${usage()}`)
    process.exitCode = 1
  }
}
