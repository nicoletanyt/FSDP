// Add class credits to a student account.
//
//   npm run seed:credits -- --help
//   npm run seed:credits -- --student jamie.lim@example.test --amount 10
//   npm run seed:credits -- --student jamie.lim@example.test --amount 5 --expires 2027-03-31
//
// The student must have a login (students.user_id), because credits belong to the account.
// Adds a non-purchase batch (source 'legacy', so no Stripe receipt or payment is faked) and
// refreshes the cached balance in credit_accounts.
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env.
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { checked, integer, requiredEnv } from './create-test-class.mjs'

export const MAX_CREDITS = 1000

export const OPTIONS = [
  { name: 'student', type: 'string', required: true, hint: 'email', desc: 'Student email. The student must have a login.' },
  { name: 'amount', type: 'string', required: true, hint: `1-${MAX_CREDITS}`, desc: 'Credits to add.' },
  { name: 'expires', type: 'string', hint: 'YYYY-MM-DD', desc: 'Expiry date (end of day, Singapore). Default: never expires.' },
  { name: 'help', short: 'h', type: 'boolean', desc: 'Show this help.' },
]

export function usage() {
  const rows = OPTIONS.map(option => {
    const flag = `--${option.name}${option.hint ? ` <${option.hint}>` : ''}`
    return `  ${flag.padEnd(26)} ${(option.required ? 'REQUIRED' : 'optional').padEnd(10)} ${option.desc}`
  })
  return ['Usage: npm run seed:credits -- --student <email> --amount <n> [options]', '', ...rows, '',
    'Example:', '  npm run seed:credits -- --student jamie.lim@example.test --amount 10'].join('\n')
}

export function validateArgs(values) {
  const email = values.student?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--student must be a student email address.')
  const amount = integer(values.amount, 'amount', 1, MAX_CREDITS)
  let expiresAt = null
  if (values.expires !== undefined) {
    const date = new Date(`${values.expires}T23:59:59+08:00`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.expires) || !Number.isFinite(date.getTime())) throw new Error('--expires must be a date like 2027-03-31.')
    if (date.getTime() <= Date.now()) throw new Error('--expires must be in the future.')
    expiresAt = date.toISOString()
  }
  return { email, amount, expiresAt }
}

// Same rule as credit_private.sync_account(): unexpired, non-unlimited batches.
export function accountBalance(batches, now = new Date()) {
  // PostgREST returns non-expiring batches as the string 'infinity', which Date.parse can't read.
  const live = batches.filter(batch => batch.expires_at === 'infinity' || Date.parse(batch.expires_at) > now.getTime())
  return {
    credits: live.filter(batch => !batch.unlimited).reduce((sum, batch) => sum + batch.credits_remaining, 0),
    unlimited: live.some(batch => batch.unlimited),
  }
}

export async function addCredits(values) {
  const args = validateArgs(values)
  const project = new URL(requiredEnv('VITE_SUPABASE_URL')).origin
  const db = createClient(project, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const student = checked(await db.from('students').select('id,first_name,last_name,email,user_id').eq('email', args.email).maybeSingle(), 'Student lookup')
  if (!student) throw new Error(`No student has the email ${args.email}.`)
  if (!student.user_id) throw new Error(`${args.email} has no login account, so credits can't be added. Pick a student with an account.`)

  const batch = checked(await db.from('credit_batches').insert({
    user_id: student.user_id, credits_total: args.amount, credits_remaining: args.amount,
    expires_at: args.expiresAt ?? 'infinity', source: 'legacy',
  }).select('id').single(), 'Credit insertion')
  const batches = checked(await db.from('credit_batches').select('credits_remaining,unlimited,expires_at').eq('user_id', student.user_id), 'Balance lookup')
  const balance = accountBalance(batches)
  checked(await db.from('credit_accounts').upsert({ user_id: student.user_id, ...balance }, { onConflict: 'user_id' }), 'Balance update')
  return { student: `${student.first_name} ${student.last_name}`.trim(), email: student.email, added: args.amount,
    expiresAt: args.expiresAt ?? 'never', batchId: batch.id, newBalance: balance.credits, unlimited: balance.unlimited }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(OPTIONS.map(({ name, type, short }) => [name, { type, ...(short && { short }) }])) })
    if (values.help) console.log(usage())
    else console.log(JSON.stringify(await addCredits(values), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Adding credits failed.')
    console.error(`\n${usage()}`)
    process.exitCode = 1
  }
}
