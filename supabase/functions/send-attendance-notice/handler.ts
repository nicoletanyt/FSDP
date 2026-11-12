import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { adminClient, authenticate, gradingHeaders } from '../_shared/grading.ts'
import { requireEnv } from '../_shared/stripe.ts'

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const address = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const maxRecipients = 10
const primaryRecipient = 'suroul29@gmail.com'

// EmailJS may echo request parameters and credentials in its error response.
export function safeEmailJsError(body: string): string {
  let message = body
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const details = parsed as Record<string, unknown>
      message = typeof details.message === 'string' ? details.message
        : typeof details.error === 'string' ? details.error : ''
    }
  } catch { /* EmailJS may also return plain text. */ }
  for (const name of ['EMAILJS_PRIVATE_KEY', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_SERVICE_ID', 'EMAILJS_EDITABLE_TEMPLATE_ID']) {
    const secret = Deno.env.get(name)
    if (secret && secret.length >= 8) message = message.replaceAll(secret, '[redacted]')
  }
  return message
    .replace(/https?:\/\/\S+/gi, '[redacted URL]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted email]')
    .replace(/\b(?:bearer|token|accessToken|secret|api[_ -]?key)\s*[:=]?\s*[\w.\-+/=]{8,}/gi, '[redacted credential]')
    .replace(/[a-z\d_-]{20,}/gi, '[redacted value]')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 200) || 'No readable provider message.'
}

type MonitoredStudent = {
  id: string; first_name: string; last_name: string; email: string
  level: string; missed: number
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

function singaporeWeek(): string {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Singapore', dateStyle: 'short' }).format(new Date())
  const utc = new Date(`${date}T00:00:00Z`)
  const daysSinceMonday = (utc.getUTCDay() + 6) % 7
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday)
  return utc.toISOString().slice(0, 10)
}

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = {}
  try {
    const config = gradingHeaders(request)
    headers = config.headers
    if (!config.allowed) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers })
    const adminId = await authenticate(request, 'administrator')
    if (!adminId) return Response.json({ error: 'Administrator access required.' }, { status: 403, headers })
    const body = await request.json()
    if (body?.client_mode !== 'bcc') {
      return Response.json({ error: 'Follow Up requires the updated admin page. No email was sent.' }, { status: 409, headers })
    }
    const centre = body?.centre_id ?? null
    const selected = body?.student_ids ?? null
    if ((centre !== null && (typeof centre !== 'string' || !uuid.test(centre))) ||
      (selected !== null && (!Array.isArray(selected) || selected.length === 0 || selected.length > maxRecipients ||
        selected.some((id: unknown) => typeof id !== 'string' || !uuid.test(id)) || new Set(selected).size !== selected.length)) ||
      (body?.confirm !== true && body?.confirm !== false)) {
      return Response.json({ error: 'Choose a valid centre and up to 10 unique students.' }, { status: 400, headers })
    }
    const token = request.headers.get('authorization')!.replace(/^Bearer\s+/i, '')
    const caller = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const db = adminClient()
    const [{ data: monitored, error: monitorError }, { data: template, error: templateError }] = await Promise.all([
      caller.rpc('admin_attendance_monitoring', { target_centre: centre }),
      db.from('admin_email_templates').select('subject,body,updated_at').eq('id', 'attendance_notice').single(),
    ])
    if (monitorError || templateError || !Array.isArray(monitored) || !template) throw new Error('Monitoring or template unavailable')
    const eligible = (monitored as MonitoredStudent[]).filter(student => student.level === 'at_risk')
    const candidates = selected ? eligible.filter(student => selected.includes(student.id)) : eligible
    if (selected && candidates.length !== selected.length) return Response.json({ error: 'A selected student is no longer eligible for an attendance notice. Refresh the list.' }, { status: 409, headers })
    const week = singaporeWeek()
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const ids = candidates.map(student => student.id)
    const [weekly, recent] = ids.length ? await Promise.all([
      db.from('admin_attendance_email_sends').select('student_id').eq('week_start', week)
        .in('student_id', ids).in('status', ['pending', 'accepted']),
      db.from('admin_attendance_email_sends').select('student_id').eq('status', 'accepted')
        .in('student_id', ids)
        .or(`completed_at.gte.${cutoff},and(completed_at.is.null,created_at.gte.${cutoff})`),
    ]) : [{ data: [], error: null }, { data: [], error: null }]
    if (weekly.error || recent.error) throw weekly.error ?? recent.error
    const alreadyNotified = new Set([...(weekly.data ?? []), ...(recent.data ?? [])].map(send => send.student_id))
    if (selected && candidates.some(student => alreadyNotified.has(student.id))) {
      return Response.json({ error: 'A selected student has a pending notice this week or was notified within the last 30 days. Refresh the list.' }, { status: 409, headers })
    }
    const recipients = candidates.filter(student => !alreadyNotified.has(student.id))
      .sort((a, b) => a.id.localeCompare(b.id))
    if (recipients.some(student => !address.test(student.email?.trim() ?? ''))) return Response.json({ error: 'A student has no valid email address. Nothing sent.' }, { status: 400, headers })
    if (recipients.some(student => student.email.trim().toLowerCase() === primaryRecipient)) {
      return Response.json({ error: 'A student has the same email address as the primary recipient. Nothing sent.' }, { status: 400, headers })
    }
    const bccEmails = [...new Set(recipients.map(student => student.email.trim().toLowerCase()))]
    const previewToken = await sha256(JSON.stringify(['bcc-v1', centre, selected,
      recipients.map(student => [student.id, student.email, student.level]),
      primaryRecipient, template.subject, template.body, template.updated_at, week]))
    const preview = { delivery_mode: 'bcc', count: recipients.length, recipients: recipients.map(student => ({ id: student.id,
      name: `${student.first_name} ${student.last_name}`.trim(), email: student.email, level: student.level })),
      email_subject: template.subject, email_body: template.body.replaceAll('{{student_name}}', 'students'),
      preview_token: previewToken, over_limit: recipients.length > maxRecipients,
      send_ready: ['EMAILJS_EDITABLE_TEMPLATE_ID', 'EMAILJS_SERVICE_ID', 'EMAILJS_PUBLIC_KEY']
        .every(name => Boolean(Deno.env.get(name)?.trim())) }
    if (!body.confirm) return Response.json(preview, { headers })
    if (body.preview_token !== previewToken) return Response.json({ error: 'Recipients or template changed. Preview again before sending.' }, { status: 409, headers })
    if (!recipients.length || recipients.length > maxRecipients) return Response.json({ error: 'Choose between 1 and 10 recipients. Nothing sent.' }, { status: 400, headers })
    if (!preview.send_ready) return Response.json({ error: 'EmailJS is not configured. Nothing sent.' }, { status: 409, headers })

    // PostgREST inserts the entire batch in one transaction. If any student's
    // weekly reservation conflicts, no BCC email may be sent to this group.
    const { data: reserved, error: reserveError } = await db.from('admin_attendance_email_sends')
      .insert(recipients.map(student => ({ student_id: student.id, requested_by: adminId, week_start: week })))
      .select('id')
    if (reserveError || reserved?.length !== recipients.length) {
      return Response.json({ error: 'A notice is already pending or accepted for a student in this group. Check send history and reopen Follow Up.' }, { status: 409, headers })
    }
    const reservationIds = reserved.map(row => row.id)
    let status: 'accepted' | 'failed' | 'pending' = 'pending'
    let failure: string | null = null
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          service_id: requireEnv('EMAILJS_SERVICE_ID'), template_id: requireEnv('EMAILJS_EDITABLE_TEMPLATE_ID'),
          user_id: requireEnv('EMAILJS_PUBLIC_KEY'),
          ...(Deno.env.get('EMAILJS_PRIVATE_KEY') ? { accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY') } : {}),
          template_params: { to_email: primaryRecipient, bcc_emails: bccEmails.join(','),
            email_subject: template.subject, email_body: preview.email_body },
        }),
      })
      status = response.ok ? 'accepted' : 'failed'
      if (!response.ok) {
        const details = await response.text().catch(() => '')
        failure = `EmailJS rejected the notice (HTTP ${response.status}): ${safeEmailJsError(details)}`
      }
    } catch {
      // An unknown provider outcome must not be retried automatically.
      failure = 'Provider response unavailable. Check EmailJS history before retrying.'
    }
    const { error: updateError } = await db.from('admin_attendance_email_sends').update({ status,
      completed_at: status === 'pending' ? null : new Date().toISOString(), error: failure }).in('id', reservationIds)
    if (updateError) throw updateError // Pending reservations prevent duplicate BCC sends.
    if (status !== 'accepted') return Response.json({ error: failure }, { status: 502, headers })
    return Response.json({ delivery_mode: 'bcc', status, recipient_count: recipients.length, bcc_count: bccEmails.length }, { headers })
  } catch {
    return Response.json({ error: 'Unable to process attendance notices. No automatic retry was attempted.' }, { status: 500, headers })
  }
}
