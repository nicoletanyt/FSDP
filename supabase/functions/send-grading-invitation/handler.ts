import { adminClient, authenticate, gradingHeaders } from '../_shared/grading.ts'
import { requireEnv } from '../_shared/stripe.ts'

const address = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const bccLimit = 50 // Conservative; connected email provider may impose a lower limit.
const primaryRecipient = 'suroulomg@gmail.com'
const dummyRecipient = 'mq07110@gmail.com'

interface GradingEvent {
  event_id: string
  track: 'adult' | 'children'
  grading_date: string
  application_opens_on: string
  application_deadline: string
  events: { name: string; centres: { name: string; address: string } | { name: string; address: string }[] } |
    { name: string; centres: { name: string; address: string } | { name: string; address: string }[] }[]
}

function singaporeToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Singapore', dateStyle: 'short' }).format(new Date())
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'long' })
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// EmailJS may echo request data in an error. Never persist or return the raw body.
export function safeEmailJsError(body: string): string {
  let message = body
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const details = parsed as Record<string, unknown>
      message = typeof details.message === 'string' ? details.message
        : typeof details.error === 'string' ? details.error : ''
    }
  } catch {
    // EmailJS also returns plain-text errors.
  }
  for (const name of ['EMAILJS_PRIVATE_KEY', 'EMAILJS_PUBLIC_KEY', 'EMAILJS_SERVICE_ID', 'EMAILJS_TEMPLATE_ID']) {
    const secret = Deno.env.get(name)
    if (secret && secret.length >= 8) message = message.replaceAll(secret, '[redacted]')
  }
  const safe = message
    .replace(/https?:\/\/\S+/gi, '[redacted URL]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted email]')
    .replace(/\b(?:bearer|token|accessToken|secret|api[_ -]?key)\s*[:=]?\s*[\w.\-+/=]{8,}/gi, '[redacted credential]')
    .replace(/[a-z\d_-]{20,}/gi, '[redacted value]')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return safe.slice(0, 200) || 'No readable provider message.'
}

function related<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = {}
  try {
    const config = gradingHeaders(request)
    headers = config.headers
    if (!config.allowed) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers })
    if (!await authenticate(request, 'administrator')) return Response.json({ error: 'Administrator access required.' }, { status: 403, headers })
    const body = await request.json()
    if ((body?.event_id !== null && (typeof body?.event_id !== 'string' || !uuid.test(body.event_id))) ||
        (body?.confirm !== true && body?.confirm !== false)) {
      return Response.json({ error: 'Select a grading event or all eligible students.' }, { status: 400, headers })
    }
    const db = adminClient()
    const [{ data: schedule, error: scheduleError }, { data: wording, error: wordingError }] = await Promise.all([
      db.from('gradings').select('event_id,track,grading_date,application_opens_on,application_deadline,events!inner(name,status,centres(name,address))')
        .eq('official_schedule', true).eq('application_status', 'open').eq('events.status', 'scheduled'),
      db.from('grading_invitation_settings').select('subject,body').eq('id', true).single(),
    ])
    if (scheduleError || wordingError || !wording) throw scheduleError ?? wordingError ?? new Error('Invitation wording unavailable')
    const today = singaporeToday()
    const available = ((schedule ?? []) as GradingEvent[]).filter((event) =>
      event.grading_date > today && event.application_opens_on <= today && event.application_deadline >= today)
    const targets = (body.event_id === null ? available : available.filter((event) => event.event_id === body.event_id))
      .sort((a, b) => a.grading_date.localeCompare(b.grading_date) || a.event_id.localeCompare(b.event_id))
    if (!targets.length) return Response.json({ error: 'No open grading events available.' }, { status: 400, headers })
    const results = await Promise.all(targets.map((event) => db.rpc('eligible_grading_students', { target_event: event.event_id })))
    if (results.some(({ error }) => error)) throw new Error('Unable to calculate eligibility')
    const students = new Map<string, string>()
    for (const { data } of results) for (const student of data ?? []) {
      students.set(student.student_id, student.email?.trim().toLowerCase() ?? '')
    }
    if ([...students.values()].some((email) => !address.test(email))) {
      return Response.json({ error: 'An eligible student has no valid email address. Nothing sent.' }, { status: 400, headers })
    }
    const emails = [...new Set([...students.values()].filter((email) => email !== primaryRecipient).concat(dummyRecipient))]
    const byDate = [...available].sort((a, b) => a.grading_date.localeCompare(b.grading_date))
    const children = byDate.find((event) => event.track === 'children')
    const adult = byDate.find((event) => event.track === 'adult')
    const emailSubject = wording.subject
    const emailBody = wording.body
      .replaceAll('{{children_grading_date}}', children ? formatDate(children.grading_date) : 'Not currently open')
      .replaceAll('{{children_application_close_date}}', children ? formatDate(children.application_deadline) : 'Not currently open')
      .replaceAll('{{adult_grading_date}}', adult ? formatDate(adult.grading_date) : 'Not currently open')
      .replaceAll('{{adult_application_close_date}}', adult ? formatDate(adult.application_deadline) : 'Not currently open')
    const name = body.event_id === null ? 'All eligible students' : related(targets[0].events)?.name ?? 'Grading'
    const campaignKey = body.event_id === null ? await sha256(targets.map((event) => event.event_id).sort().join(',')) : null
    const previewToken = await sha256(JSON.stringify([targets.map((event) => event.event_id), emails, emailSubject, emailBody]))
    const preview = { event: name, eligible: students.size, bcc_count: emails.length, bcc_emails: emails,
      email_subject: emailSubject, email_body: emailBody, preview_token: previewToken,
      over_limit: emails.length > bccLimit, send_ready: Boolean(Deno.env.get('EMAILJS_EDITABLE_TEMPLATE_ID')) }
    if (!body.confirm) return Response.json(preview, { headers })
    if (body.preview_token !== previewToken) return Response.json({ error: 'Invitation details changed. Preview again before sending.' }, { status: 409, headers })
    if (emails.length > bccLimit) return Response.json({ error: `BCC list exceeds the ${bccLimit}-address safety limit. Nothing sent.` }, { status: 400, headers })
    if (!students.size) return Response.json({ error: 'No eligible students. Nothing sent.' }, { status: 400, headers })
    if (!Deno.env.get('EMAILJS_EDITABLE_TEMPLATE_ID')) {
      return Response.json({ error: 'Configure the editable EmailJS template before sending. Nothing sent.' }, { status: 409, headers })
    }
    // Unique pending/accepted index makes concurrent confirmations a single send.
    const { data: send, error: reserveError } = await db.from('grading_email_sends')
      .insert({ grading_event_id: body.event_id, event_name: name, campaign_key: campaignKey, recipient_count: emails.length }).select('id').single()
    if (reserveError || !send) return Response.json({ error: 'Invitation already pending or accepted for this selection.' }, { status: 409, headers })
    let accepted = false
    let failure = 'EmailJS rejected the invitation.'
    let ambiguous = false
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: requireEnv('EMAILJS_SERVICE_ID'), template_id: requireEnv('EMAILJS_EDITABLE_TEMPLATE_ID'),
          user_id: requireEnv('EMAILJS_PUBLIC_KEY'),
          ...(Deno.env.get('EMAILJS_PRIVATE_KEY') ? { accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY') } : {}),
          template_params: {
            to_email: primaryRecipient, bcc_emails: emails.join(','),
            email_subject: emailSubject, email_body: emailBody,
          },
        }),
      })
      accepted = response.ok
      if (!accepted) {
        const details = await response.text().catch(() => '')
        failure = `EmailJS HTTP ${response.status}: ${safeEmailJsError(details)}`
      }
    } catch {
      // Network failures are ambiguous: never automatically retry a potentially accepted send.
      failure = 'EmailJS response unavailable; check EmailJS history before retrying.'
      ambiguous = true
    }
    const { error: updateError } = await db.from('grading_email_sends').update({
      status: accepted ? 'accepted' : ambiguous ? 'pending' : 'failed', completed_at: ambiguous ? null : new Date().toISOString(), error: accepted ? null : failure,
    }).eq('id', send.id)
    if (updateError) throw updateError
    return Response.json({ ...preview, status: accepted ? 'accepted' : 'failed', error: accepted ? null : failure }, { status: accepted ? 200 : 502, headers })
  } catch {
    return Response.json({ error: 'Unable to process invitation.' }, { status: 500, headers })
  }
}
