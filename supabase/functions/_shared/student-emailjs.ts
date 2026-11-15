import { adminClient } from './grading.ts'
import { requireEnv } from './stripe.ts'

const primaryRecipient = 'suroul29@gmail.com'
const emailPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

export type StudentMessage = { to: string; subject: string; text: string }

/** One EmailJS request per logical message. A reserved key is never retried
 * automatically: network failures may mean EmailJS accepted the first request. */
export async function sendStudentEmail(message: StudentMessage, key: string): Promise<string> {
  const recipient = message.to.trim()
  if (!emailPattern.test(recipient) || recipient.toLowerCase() === primaryRecipient ||
    !message.subject.trim() || /[\r\n]/.test(message.subject) || !message.text.trim() ||
    !key || key.length > 255) {
    throw new Error('Invalid student email request.')
  }
  const serviceId = requireEnv('EMAILJS_SERVICE_ID')
  const templateId = requireEnv('EMAILJS_EDITABLE_TEMPLATE_ID')
  const publicKey = requireEnv('EMAILJS_PUBLIC_KEY')
  const db = adminClient()
  const { data, error } = await db.from('student_email_sends')
    .upsert({ send_key: key }, { onConflict: 'send_key', ignoreDuplicates: true })
    .select('send_key')
  if (error) throw new Error('Could not reserve student email.')
  if (!data?.length) return 'already-reserved'

  let status: 'accepted' | 'failed' = 'failed'
  let definiteFailure = false
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        service_id: serviceId, template_id: templateId, user_id: publicKey,
        ...(Deno.env.get('EMAILJS_PRIVATE_KEY') ? { accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY') } : {}),
        // The EmailJS transport template renders email_body inside HTML.
        template_params: { to_email: primaryRecipient, bcc_emails: recipient,
          email_subject: message.subject, email_body: message.text.replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
          })[char]!) },
      }),
    })
    definiteFailure = !response.ok
    if (response.ok) status = 'accepted'
  } catch {
    // An unknown provider outcome remains pending; never automatically resend.
  }
  if (status === 'accepted' || definiteFailure) {
    const { error: updateError } = await db.from('student_email_sends')
      .update({ status, completed_at: new Date().toISOString() }).eq('send_key', key)
    if (updateError) throw new Error('Could not record student email outcome.')
  }
  if (status !== 'accepted') throw new Error('Student email was not accepted by EmailJS.')
  return 'accepted'
}
