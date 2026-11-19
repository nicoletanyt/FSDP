// One-off, manually approved resend. Only run after a retry receipt was
// atomically reserved and the EmailJS To/Bcc fields were verified by the owner.
// Do not log addresses, template parameters, credentials or provider response.
import { createClient } from '@supabase/supabase-js'

const invitationId = '72fae06d-bef0-427f-88fe-14ebc9b8db50'
const eventId = '0051ec00-f5a5-4a3b-b9a2-37d3c68270f0'
const instructorId = '57992b9b-6914-4d4c-82a2-6b90d8197917'
const adminTo = 'suroul29@gmail.com'
const required = key => {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`Missing ${key}`)
  return value
}
const db = createClient(required('VITE_SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const one = async (table, selection, filters) => {
  let query = db.from(table).select(selection)
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
  const { data, error } = await query.single()
  if (error) throw error
  return data
}
const retry = await one('class_cover_invitation_retry_audit', 'status', { invitation_id: invitationId })
const invitation = await one('class_cover_test_invitations',
  'id,event_id,instructor_id,status,provider_http_status,email_subject,email_body', { id: invitationId })
const event = await one('events', 'name,starts_at,status', { id: eventId })
const instructor = await one('instructors', 'first_name,last_name,email', { id: instructorId })
if (retry.status !== 'sending' || invitation.status !== 'failed' || invitation.provider_http_status !== 422 ||
  invitation.event_id !== eventId || invitation.instructor_id !== instructorId ||
  event.name !== 'Mixed/Family' || event.status !== 'scheduled' || new Date(event.starts_at) <= new Date() ||
  instructor.first_name !== 'Priya' || instructor.last_name !== 'Rao' ||
  !invitation.email_subject?.startsWith('Cover request: Mixed/Family') ||
  !invitation.email_body?.includes(`?cover=${invitationId}`) ||
  !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(instructor.email)) {
  throw new Error('Invitation or recipient changed; no email sent.')
}
// Claimed before network access. A crash leaves 'sending' and must be
// investigated; it must never cause a second automatic attempt.
const { data: claimed, error: claimError } = await db.from('class_cover_invitation_retry_audit')
  .update({ status: 'uncertain', failure_reason: 'EmailJS response unavailable; delivery uncertain. Do not resend.' })
  .eq('invitation_id', invitationId).eq('status', 'sending').select('invitation_id').single()
if (claimError || !claimed) throw new Error('Retry was already claimed; no email sent.')

let status = 'uncertain'
let provider_http_status = null
let failure_reason = 'EmailJS response unavailable; delivery uncertain. Do not resend.'
try {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: required('EMAILJS_SERVICE_ID'), template_id: required('EMAILJS_TEMPLATE_ID'),
      user_id: required('EMAILJS_PUBLIC_KEY'),
      template_params: { to_email: adminTo, bcc_emails: instructor.email,
        email_subject: invitation.email_subject, email_body: invitation.email_body },
    }),
  })
  provider_http_status = response.status
  status = response.ok ? 'accepted' : 'failed'
  if (response.ok) failure_reason = null
  else {
    const message = (await response.text().catch(() => '')).slice(0, 4096).toLowerCase()
    failure_reason = /recipient|to_email|bcc|email.address/.test(message) && /corrupt|invalid|missing|required|not found/.test(message)
      ? 'EmailJS rejected a recipient address or recipient template setting; no automatic retry.'
      : 'EmailJS rejected the invitation; provider reason unclassified; no automatic retry.'
  }
} catch { /* The claim remains uncertain; never auto-retry. */ }
const { error: saveError } = await db.from('class_cover_invitation_retry_audit')
  .update({ status, provider_http_status, failure_reason, completed_at: status === 'uncertain' ? null : new Date().toISOString() })
  .eq('invitation_id', invitationId).eq('status', 'uncertain')
if (saveError) throw saveError
// The main receipt drives the existing admin and instructor UI. Original
// rejection details remain in the retry audit row even if this succeeds.
if (status === 'accepted') {
  const { error } = await db.from('class_cover_test_invitations')
    .update({ status: 'accepted', provider_http_status, failure_reason: null, updated_at: new Date().toISOString() })
    .eq('id', invitationId).eq('status', 'failed')
  if (error) throw error
}
console.log(JSON.stringify({ status, provider_http_status, failure_reason }))
