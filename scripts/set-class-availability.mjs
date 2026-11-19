// Mark an instructor's class unavailable (cover request), or available again.
//
//   npm run seed:availability -- --help
//   npm run seed:availability -- --datetime "2026-11-25T18:00" --instructor coach@example.test --class-type adults
//   npm run seed:availability -- --datetime "2026-11-25T18:00" --instructor coach@example.test --class-type adults --available
//
// Unavailable: creates the same instructor_class_unavailability row the instructor's
// "unavailable" button does (no admin email is sent). Available: cancels that request.
// Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the root .env.
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { checked, parseStart, requiredEnv } from './create-test-class.mjs'

export const OPTIONS = [
  { name: 'datetime', type: 'string', required: true, hint: 'ISO', desc: 'Class start, to the minute. No offset means Singapore time (+08:00).' },
  { name: 'instructor', type: 'string', required: true, hint: 'email', desc: 'Email of the instructor assigned to the class.' },
  { name: 'class-type', type: 'string', required: true, hint: 'id', desc: 'class_types.id of the class, e.g. adults, weapons.' },
  { name: 'available', type: 'boolean', desc: 'Toggle back: cancel the unavailability request instead of creating one.' },
  { name: 'help', short: 'h', type: 'boolean', desc: 'Show this help.' },
]

export function usage() {
  const rows = OPTIONS.map(option => {
    const flag = `--${option.name}${option.hint ? ` <${option.hint}>` : ''}`
    return `  ${flag.padEnd(26)} ${(option.required ? 'REQUIRED' : 'optional').padEnd(10)} ${option.desc}`
  })
  return ['Usage: npm run seed:availability -- --datetime <ISO> --instructor <email> --class-type <id> [--available]', '', ...rows, '',
    'Example:', '  npm run seed:availability -- --datetime "2026-11-25T18:00" --instructor coach@example.test --class-type adults'].join('\n')
}

export function validateArgs(values) {
  const startsAt = parseStart(values.datetime)
  const email = values.instructor?.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--instructor must be an instructor email address.')
  const classType = values['class-type']?.trim()
  if (!classType) throw new Error('--class-type is required (e.g. adults).')
  return { startsAt, email, classType, available: Boolean(values.available) }
}

// What to do given the existing request (if any). Pure, so it can be tested.
export function planChange(existing, available) {
  if (available) {
    if (!existing || existing.status === 'cancelled') return { action: 'none', note: 'Already available: there is no open unavailability request.' }
    if (existing.status === 'covered') throw new Error('Another instructor is already covering this class, so it can\'t be made available.')
    return { action: 'update', status: 'cancelled' }
  }
  if (!existing) return { action: 'insert' }
  if (existing.status === 'open') return { action: 'none', note: 'Already unavailable: the request is already open.' }
  if (existing.status === 'covered') throw new Error('Another instructor is already covering this class.')
  return { action: 'update', status: 'open' }
}

export async function setClassAvailability(values) {
  const args = validateArgs(values)
  const project = new URL(requiredEnv('VITE_SUPABASE_URL')).origin
  const db = createClient(project, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const instructor = checked(await db.from('instructors').select('id,user_id,email').eq('email', args.email).maybeSingle(), 'Instructor lookup')
  if (!instructor) throw new Error('No instructor record matches that email.')
  if (!instructor.user_id) throw new Error('That instructor has no login account.')

  const minute = args.startsAt.getTime() - (args.startsAt.getTime() % 60_000)
  const rows = checked(await db.from('events').select('id,name,starts_at,status,classes!inner(class_type_id)')
    .eq('event_type', 'class').eq('instructor_id', instructor.id).eq('classes.class_type_id', args.classType)
    .gte('starts_at', new Date(minute).toISOString()).lt('starts_at', new Date(minute + 60_000).toISOString()), 'Class lookup')
  if (!rows.length) throw new Error(`No ${args.classType} class for ${args.email} starts at ${args.startsAt.toISOString()}. Check the time, instructor and class type.`)
  if (rows.length > 1) throw new Error('More than one class matches. Change the time or class type.')
  const event = rows[0]

  const existing = checked(await db.from('instructor_class_unavailability').select('id,status').eq('event_id', event.id).maybeSingle(), 'Request lookup')
  const change = planChange(existing, args.available)
  if (!args.available && change.action !== 'none' && (event.status !== 'scheduled' || args.startsAt.getTime() <= Date.now())) {
    throw new Error('Only future scheduled classes can be reported unavailable.')
  }
  if (change.action === 'insert') {
    checked(await db.from('instructor_class_unavailability').insert({ event_id: event.id, instructor_id: instructor.id, user_id: instructor.user_id }), 'Request insertion')
  } else if (change.action === 'update') {
    checked(await db.from('instructor_class_unavailability').update({ status: change.status }).eq('id', existing.id), 'Request update')
  }
  const saved = checked(await db.from('instructor_class_unavailability').select('status').eq('event_id', event.id).maybeSingle(), 'Verification')
  return { class: event.name, eventId: event.id, startsAt: event.starts_at, instructor: instructor.email, classType: args.classType,
    state: saved?.status === 'open' ? 'unavailable' : 'available', requestStatus: saved?.status ?? 'none', ...(change.note ? { note: change.note } : {}) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(OPTIONS.map(({ name, type, short }) => [name, { type, ...(short && { short }) }])) })
    if (values.help) console.log(usage())
    else console.log(JSON.stringify(await setClassAvailability(values), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Changing availability failed.')
    console.error(`\n${usage()}`)
    process.exitCode = 1
  }
}
