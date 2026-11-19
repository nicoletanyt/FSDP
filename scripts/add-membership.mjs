// Give a student an active membership without Stripe, with dummy payment/contact data.
//
//   npm run seed:membership -- --help
//   npm run seed:membership -- --student jamie.lim@example.test
//   npm run seed:membership -- --student jamie.lim@example.test --rank yellow-10th-kyu --months 6
//
// Calls the same finalize_membership_fee() the Stripe webhook uses, with a fake session id,
// so the student becomes active, membership_expires_on is extended, and a paid "Membership"
// payment row appears in their history. The student must have a login (students.user_id).
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env.
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { checked, integer, requiredEnv } from './create-test-class.mjs'

export const DUMMY = {
  amountCents: 12000, currency: 'sgd', feeTitle: 'Membership fee (test)',
  phone: '91234567', contact: { name: 'Test Contact', relationship: 'Parent', phone: '91234567' },
}

export const OPTIONS = [
  { name: 'student', type: 'string', required: true, hint: 'email', desc: 'Student email. The student must have a login.' },
  { name: 'rank', type: 'string', hint: 'grade id', desc: 'Set current rank to this grades.id (e.g. unranked, yellow-10th-kyu). Default: keep current.' },
  { name: 'months', type: 'string', default: '12', hint: '1-120', desc: 'Months added to the membership expiry.' },
  { name: 'help', short: 'h', type: 'boolean', desc: 'Show this help.' },
]

export function usage() {
  const rows = OPTIONS.map(option => {
    const flag = `--${option.name}${option.hint ? ` <${option.hint}>` : ''}`
    const meta = option.required ? 'REQUIRED' : option.default ? `default: ${option.default}` : 'optional'
    return `  ${flag.padEnd(26)} ${meta.padEnd(14)} ${option.desc}`
  })
  return ['Usage: npm run seed:membership -- --student <email> [options]', '', ...rows, '',
    'Example:', '  npm run seed:membership -- --student jamie.lim@example.test --rank yellow-10th-kyu'].join('\n')
}

export function validateArgs(values) {
  const email = values.student?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--student must be a student email address.')
  return { email, rank: values.rank?.trim() || null, months: integer(values.months ?? '12', 'months', 1, 120) }
}

export async function addMembership(values) {
  const args = validateArgs(values)
  const project = new URL(requiredEnv('VITE_SUPABASE_URL')).origin
  const db = createClient(project, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const student = checked(await db.from('students').select('id,first_name,last_name,email,user_id,phone').eq('email', args.email).maybeSingle(), 'Student lookup')
  if (!student) throw new Error(`No student has the email ${args.email}.`)
  if (!student.user_id) throw new Error(`${args.email} has no login account, so a membership can't be activated. Pick a student with an account.`)
  const grades = checked(await db.from('grades').select('id,label,sort_order').order('sort_order'), 'Grade lookup')
  if (args.rank && !grades.some(grade => grade.id === args.rank)) {
    throw new Error(`Unknown rank "${args.rank}". Valid ids: ${grades.map(grade => grade.id).join(', ')}.`)
  }

  // Dummy details, only where missing: never overwrite real data.
  const contacts = checked(await db.from('emergency_contacts').select('id').eq('student_id', student.id).eq('is_primary', true), 'Contact lookup')
  if (!contacts.length) checked(await db.from('emergency_contacts').insert({ student_id: student.id, ...DUMMY.contact, is_primary: true }), 'Contact insertion')
  const changes = { ...(student.phone ? {} : { phone: DUMMY.phone }), ...(args.rank ? { current_grade_id: args.rank } : {}) }
  if (Object.keys(changes).length) checked(await db.from('students').update(changes).eq('id', student.id), 'Student update')

  const session = `test_membership_${randomUUID()}`
  checked(await db.rpc('finalize_membership_fee', { student: student.id, stripe_session: session, fee_title: DUMMY.feeTitle,
    months: args.months, paid_amount: DUMMY.amountCents, paid_currency: DUMMY.currency }), 'Membership activation')

  const saved = checked(await db.from('students').select('membership_status,membership_expires_on,current_grade_id').eq('id', student.id).single(), 'Verification')
  return { student: `${student.first_name} ${student.last_name}`.trim(), email: student.email, status: saved.membership_status,
    expiresOn: saved.membership_expires_on, rank: saved.current_grade_id, fakePayment: { session, amount: `${DUMMY.amountCents / 100} ${DUMMY.currency.toUpperCase()}` } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(OPTIONS.map(({ name, type, short }) => [name, { type, ...(short && { short }) }])) })
    if (values.help) console.log(usage())
    else console.log(JSON.stringify(await addMembership(values), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Adding membership failed.')
    console.error(`\n${usage()}`)
    process.exitCode = 1
  }
}
