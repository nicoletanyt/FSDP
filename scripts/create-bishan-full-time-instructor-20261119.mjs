// One-time synthetic instructor account. Uses Supabase Auth's invitation mail
// instead of EmailJS; never prints a password or sends a cover invitation.
// The plus-address is deliverable to the administrator's Gmail inbox.
import { createClient } from '@supabase/supabase-js'

const email = 'suroul29+bishan.cover.demo@gmail.com'
const firstName = 'Alyssa'
const lastName = 'Tan'
const requireEnv = key => {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`Missing ${key}`)
  return value
}
const db = createClient(requireEnv('VITE_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const { data: existing, error: existingError } = await db.from('users').select('id,first_name,last_name,role').eq('email', email).maybeSingle()
if (existingError) throw existingError
if (existing && (existing.first_name !== firstName || existing.last_name !== lastName || existing.role !== 'instructor'))
  throw new Error('The login belongs to another account; no invitation was sent.')
const { data: grade, error: gradeError } = await db.from('grades').select('id,is_ranked').eq('id', '2nd-dan').single()
if (gradeError || !grade?.is_ranked) throw new Error('Instructor grade is unavailable; nothing created.')
const { data: source, error: sourceError } = await db.from('instructor_private_details')
  .select('landmark,region,latitude,longitude,geocode_source,address,instructors!inner(first_name,last_name)')
  .eq('landmark', 'Bishan Community Centre').eq('geocode_source', 'synthetic_public_landmark')
  .eq('instructors.first_name', 'Jamie').eq('instructors.last_name', 'Chen').single()
if (sourceError || !source || source.address !== 'Synthetic location: Bishan Community Centre (approximate, not a home address)' ||
  !Number.isFinite(source.latitude) || !Number.isFinite(source.longitude))
  throw new Error('Synthetic Bishan landmark could not be verified; nothing created.')

// Auth sends an invite link to the plus-address. Once signed in, the account
// owner can set a password through the instructor profile; no credentials are
// stored in the script, database notes, or console output.
let userId = existing?.id
if (!userId) {
  const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName },
    redirectTo: 'https://fsdp-kappa.vercel.app/instructor/dashboard',
  })
  if (error || !data.user) throw new Error(`Auth invite failed; verify account state before retrying: ${error?.message ?? 'unknown'}`)
  userId = data.user.id
  const { error: roleError } = await db.auth.admin.updateUserById(userId, {
    app_metadata: { role: 'instructor', instructor_grade_id: '2nd-dan', instructor_title: 'none', instructor_is_examiner: false },
  })
  if (roleError) throw new Error(`Auth invite created but role update failed: ${roleError.message}`)
}
const { data: instructor, error: instructorError } = await db.from('instructors')
  .select('id,first_name,last_name,email,grade_id,employment_type').eq('user_id', userId).single()
if (instructorError || !instructor || instructor.first_name !== firstName || instructor.last_name !== lastName ||
  instructor.email !== email || instructor.grade_id !== '2nd-dan' ||
  (instructor.employment_type !== null && instructor.employment_type !== 'full_time'))
  throw new Error('The linked instructor record is not the expected synthetic account.')
if (!instructor.employment_type) {
  const { error } = await db.from('instructors').update({ employment_type: 'full_time' })
    .eq('id', instructor.id).is('employment_type', null)
  if (error) throw error
}
const { data: current, error: currentError } = await db.from('instructor_private_details')
  .select('instructor_id,landmark,geocode_source,address').eq('instructor_id', instructor.id).maybeSingle()
if (currentError) throw currentError
if (current && (current.landmark !== source.landmark || current.geocode_source !== 'synthetic_public_landmark' || current.address !== source.address))
  throw new Error('A different private location already exists; not overwritten.')
if (!current) {
  const { error: locationError } = await db.from('instructor_private_details').insert({
    instructor_id: instructor.id, address: source.address, landmark: source.landmark,
    region: source.region, latitude: source.latitude, longitude: source.longitude,
    geocode_source: 'synthetic_public_landmark',
  })
  if (locationError) throw new Error(`Instructor created but synthetic location failed: ${locationError.message}`)
}
console.log(JSON.stringify({ instructor_id: instructor.id, login: email, auth_invite: existing ? 'already requested; not resent' : 'requested', cover_email: 'not sent' }))
