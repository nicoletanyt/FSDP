import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const email = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
// Temporary exact origin for local phone testing, as in nfc-check-in.
const httpTestOrigin = 'http://192.168.1.13:5173'
// Temporary: admin opens the alert on the same computer running Vite.
// Replace with the deployed admin app origin before sending real alerts.
const adminEmailLinkOrigin = 'http://localhost:5173'

type CoverRequest = {
  id: string; event_id: string; notification_status: 'pending' | 'sending' | 'accepted' | 'failed'
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function functionHeaders(request: Request) {
  const allowed = [requiredEnv('APP_URL'), ...(Deno.env.get('AUTH_ALLOWED_ORIGINS') ?? '').split(','), httpTestOrigin]
    .filter(Boolean).map(value => new URL(value.trim()).origin)
  const origin = request.headers.get('origin')
  return {
    allowed: !origin || allowed.includes(origin),
    headers: {
      'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0],
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store', 'Vary': 'Origin',
    },
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('en-SG', {
    timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function singaporeDate(value: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Singapore', dateStyle: 'short' }).format(new Date(value))
}

// Never store the provider response: EmailJS may echo template IDs, API keys,
// addresses, or the whole payload. Match it to one of these fixed labels only.
export function emailJsFailureReason(body: string): string {
  const message = body.slice(0, 4096).toLowerCase()
  const invalid = '(?:invalid|not found|does not exist|doesn\'t exist)'
  if (new RegExp(`(?:template(?:_id)?[^.;\\n]{0,40}${invalid}|${invalid}[^.;\\n]{0,40}template(?:_id)?)`).test(message))
    return 'EmailJS template was not found or is invalid.'
  if (new RegExp(`(?:service(?:_id)?[^.;\\n]{0,40}${invalid}|${invalid}[^.;\\n]{0,40}service(?:_id)?|service[^.;\\n]{0,40}disconnected)`).test(message))
    return 'EmailJS service was not found, is invalid, or is disconnected.'
  if (/(?:user_id|public.key|private.key|access.token|authentication|unauthori[sz]ed)/.test(message))
    return 'EmailJS credentials or account authorization were rejected.'
  if (/(?:recipient|to_email|email.address)/.test(message) && /(?:invalid|missing|required|not found)/.test(message))
    return 'EmailJS recipient address or template recipient setting is invalid.'
  if (/(?:quota|rate.limit|too many requests|limit exceeded)/.test(message))
    return 'EmailJS account limit or rate limit was reached.'
  if (/(?:origin|domain|whitelist|allowlist)/.test(message))
    return 'EmailJS origin or domain policy rejected the request.'
  if (/(?:blocked|disabled|suspended)/.test(message))
    return 'EmailJS account or sending service is disabled.'
  return 'EmailJS rejected the request; its response could not be safely classified.'
}

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  try {
    const config = functionHeaders(request)
    headers = config.headers
    if (!config.allowed) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers })
    const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!bearer) return Response.json({ error: 'Sign in as an instructor.' }, { status: 401, headers })
    const caller = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await caller.auth.getUser(bearer)
    if (authError || !user) return Response.json({ error: 'Session expired. Sign in again.' }, { status: 401, headers })
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !('event_id' in body) || typeof body.event_id !== 'string' || !uuid.test(body.event_id)) {
      return Response.json({ error: 'Choose a valid class.' }, { status: 400, headers })
    }

    // The security-definer RPC checks the actual signed-in account and assigned
    // class under a row lock. Never use a client-supplied instructor identity.
    const { data: saved, error: saveError } = await caller.rpc('report_instructor_class_unavailability', { target_event: body.event_id })
    if (saveError) {
      const code = saveError.code === '42501' ? 403 : saveError.code === '22023' || saveError.code === '23505' ? 409 : 500
      return Response.json({ error: code === 403 ? 'This is not your assigned class.' : code === 409 ? 'This class cannot be reported now.' : 'Unable to save the request.' }, { status: code, headers })
    }
    const record = saved as CoverRequest
    if (record.notification_status !== 'pending') {
      return Response.json({ request_id: record.id, notification_status: record.notification_status }, { headers })
    }
    const template = Deno.env.get('EMAILJS_ADMIN_UNAVAILABILITY_TEMPLATE_ID')?.trim()
    const recipient = Deno.env.get('ADMIN_UNAVAILABILITY_EMAIL')?.trim()
    if (!template || !recipient || !email.test(recipient) || !Deno.env.get('EMAILJS_SERVICE_ID') || !Deno.env.get('EMAILJS_PUBLIC_KEY')) {
      return Response.json({ request_id: record.id, notification_status: 'pending', email_note: 'Admin email is not configured.' }, { headers })
    }
    const db = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: details, error: eventError } = await db.from('events')
      .select('id,name,starts_at,ends_at,centre_id,status,centres(name),instructors(first_name,last_name)')
      .eq('id', record.event_id).single()
    if (eventError || !details) throw eventError ?? new Error('Class not found')
    if (details.status !== 'scheduled' || new Date(details.starts_at).getTime() <= Date.now()) {
      return Response.json({ request_id: record.id, notification_status: 'pending', email_note: 'Class has started or was cancelled; no email sent.' }, { headers })
    }
    // Only the first request handler may claim the send. A network timeout
    // leaves 'sending' for manual review, never an automatic duplicate email.
    const { data: claimed, error: claimError } = await db.from('instructor_class_unavailability')
      .update({ notification_status: 'sending', notification_attempted_at: new Date().toISOString() })
      .eq('id', record.id).eq('status', 'open').eq('notification_status', 'pending')
      .select('id').maybeSingle()
    if (claimError) throw claimError
    if (!claimed) {
      const { data: latest, error } = await db.from('instructor_class_unavailability')
        .select('notification_status').eq('id', record.id).single()
      if (error) throw error
      return Response.json({ request_id: record.id, notification_status: latest.notification_status }, { headers })
    }

    const centre = Array.isArray(details.centres) ? details.centres[0] : details.centres
    const instructor = Array.isArray(details.instructors) ? details.instructors[0] : details.instructors
    const date = singaporeDate(details.starts_at)
    const link = new URL('/admin/calendar', adminEmailLinkOrigin)
    link.searchParams.set('centre', details.centre_id)
    link.searchParams.set('date', date)
    link.searchParams.set('session', `${details.id}:${date}`)
    let accepted = false
    let definitiveFailure = false
    let httpStatus: number | null = null
    let failureReason: string | null = null
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: requiredEnv('EMAILJS_SERVICE_ID'), template_id: template,
          user_id: requiredEnv('EMAILJS_PUBLIC_KEY'),
          ...(Deno.env.get('EMAILJS_PRIVATE_KEY') ? { accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY') } : {}),
          template_params: {
            to_email: recipient,
            instructor_name: `${instructor?.first_name ?? ''} ${instructor?.last_name ?? ''}`.trim(),
            class_name: details.name, class_date: formatDate(details.starts_at),
            start_time: formatTime(details.starts_at), end_time: formatTime(details.ends_at),
            dojo_name: centre?.name ?? 'Dojo not recorded', admin_calendar_url: link.toString(),
          },
        }),
      })
      accepted = response.ok
      definitiveFailure = !response.ok
      httpStatus = response.status
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        failureReason = emailJsFailureReason(body)
      }
    } catch {
      // An unavailable response is ambiguous; do not retry automatically.
      failureReason = 'EmailJS response was unavailable; delivery status is uncertain.'
    }
    const notificationStatus = accepted ? 'accepted' : definitiveFailure ? 'failed' : 'sending'
    const { error: updateError } = await db.from('instructor_class_unavailability')
      .update({ notification_status: notificationStatus, notification_updated_at: new Date().toISOString(),
        notification_http_status: httpStatus, notification_failure_reason: failureReason })
      .eq('id', record.id).eq('notification_status', 'sending')
    if (updateError) throw updateError
    return Response.json({ request_id: record.id, notification_status: notificationStatus }, { headers })
  } catch {
    console.error('Class unavailability request failed.')
    return Response.json({ error: 'Unable to complete the request. Check its status before trying again.' }, { status: 500, headers })
  }
}
