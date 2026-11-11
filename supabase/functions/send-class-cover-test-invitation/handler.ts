import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const testEmail = /^[^\s@,;<>]+@example(?:\.test)?\.com$/i
// Invitations remain test-only, but the confirmation link opens the deployed app.
const confirmationOrigin = 'https://fsdp-kappa.vercel.app'
const localTestOrigin = 'http://localhost:5173'

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function headersFor(request: Request) {
  const origins = [requireEnv('APP_URL'), ...(Deno.env.get('AUTH_ALLOWED_ORIGINS') ?? '').split(','), confirmationOrigin, localTestOrigin, 'http://192.168.1.13:5173']
    .filter(Boolean).map(value => new URL(value.trim()).origin)
  const origin = request.headers.get('origin')
  return {
    allowed: !origin || origins.includes(origin),
    headers: {
      'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : origins[0],
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store', 'Vary': 'Origin',
    },
  }
}

type Details = {
  id: string; name: string; centre_id: string; starts_at: string; ends_at: string; status: string
  centres: { name: string } | { name: string }[] | null
}
type Instructor = { id: string; first_name: string; last_name: string; email: string }

function related<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

export function invitationCopy(event: Details, instructor: Instructor, confirmationUrl: string) {
  const date = new Date(event.starts_at).toLocaleDateString('en-SG', {
    timeZone: 'Asia/Singapore', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const time = (value: string) => new Date(value).toLocaleTimeString('en-SG', {
    timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true,
  })
  const email_subject = `[Cover Test] Cover request: ${event.name} — ${date}`
  const email_body = `Hi ${instructor.first_name} ${instructor.last_name},

You have been requested to cover the following class as the assigned instructor is unavailable.

Class: ${event.name}
Date: ${date}
Time: ${time(event.starts_at)}–${time(event.ends_at)} (Singapore time)
Dojo: ${related(event.centres)?.name ?? 'Dojo not recorded'}

Please confirm your availability by accepting or declining the request through the link below.

Respond to Cover Request: ${confirmationUrl}

Thank you for your support.

Aikido Shinju-Kai`
  return { email_subject, email_body }
}

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  try {
    const config = headersFor(request)
    headers = config.headers
    if (!config.allowed) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers })
    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!token) return Response.json({ error: 'Administrator access required.' }, { status: 403, headers })
    const caller = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await caller.auth.getUser(token)
    if (authError || !user) return Response.json({ error: 'Session expired.' }, { status: 401, headers })
    const { data: profile, error: roleError } = await caller.from('users').select('role').eq('id', user.id).single()
    if (roleError || profile?.role !== 'administrator') return Response.json({ error: 'Administrator access required.' }, { status: 403, headers })
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !('event_id' in body) || typeof body.event_id !== 'string' || !uuid.test(body.event_id) ||
      !('instructor_id' in body) || typeof body.instructor_id !== 'string' || !uuid.test(body.instructor_id) ||
      !('action' in body) || !['preview', 'send'].includes(String(body.action))) {
      return Response.json({ error: 'Select a valid test class and instructor.' }, { status: 400, headers })
    }
    const { event_id, instructor_id, action } = body as { event_id: string; instructor_id: string; action: 'preview' | 'send' }
    const db = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: eligible, error: eligibilityError } = await caller.rpc('preview_class_cover_candidates', { target_event: event_id })
    if (eligibilityError || !eligible?.some((item: { instructor_id: string; eligibility: string }) =>
      item.instructor_id === instructor_id && item.eligibility === 'demo_only_match')) {
      return Response.json({ error: 'This instructor is not currently eligible for the test class.' }, { status: 409, headers })
    }
    const [{ data: event, error: eventError }, { data: instructor, error: instructorError }] = await Promise.all([
      db.from('events').select('id,name,centre_id,starts_at,ends_at,status,centres(name)').eq('id', event_id).single(),
      db.from('instructors').select('id,first_name,last_name,email').eq('id', instructor_id).single(),
    ])
    if (eventError || instructorError || !event || !instructor || event.name !== '[Cover Test] Weekday 3 PM' ||
      event.status !== 'scheduled' || new Date(event.starts_at).getTime() <= Date.now() || !testEmail.test(instructor.email)) {
      return Response.json({ error: 'Test class or recipient is unavailable.' }, { status: 409, headers })
    }
    if (action === 'preview') return Response.json({ error: 'Preview is no longer available.' }, { status: 410, headers })

    const template = Deno.env.get('EMAILJS_TEMPLATE_ID')?.trim()
    if (!template || !Deno.env.get('EMAILJS_SERVICE_ID') || !Deno.env.get('EMAILJS_PUBLIC_KEY')) {
      return Response.json({ error: 'Invitation EmailJS settings are not configured. Nothing sent.' }, { status: 409, headers })
    }
    // RPC atomically rechecks the admin, test-only recipient and current
    // eligibility under an event lock before claiming this send once.
    const { data: invitationId, error: reserveError } = await caller.rpc('reserve_class_cover_test_invitation', {
      target_event: event_id, target_instructor: instructor_id,
    })
    if (reserveError || !invitationId) return Response.json({ error: 'Invitation already recorded or no longer eligible. Check send history before trying again.' }, { status: 409, headers })
    const confirmationUrl = `${confirmationOrigin}/instructor/calendar?cover=${invitationId}`
    const copy = invitationCopy(event as Details, instructor as Instructor, confirmationUrl)
    const { error: copyError } = await db.from('class_cover_test_invitations')
      .update({ ...copy, updated_at: new Date().toISOString() }).eq('id', invitationId).eq('status', 'sending')
    if (copyError) throw copyError // Claimed; do not send if the audit copy cannot be saved.
    let status: 'accepted' | 'failed' | 'uncertain' = 'uncertain'
    let provider_http_status: number | null = null
    let failure_reason: string | null = null
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: requireEnv('EMAILJS_SERVICE_ID'), template_id: template, user_id: requireEnv('EMAILJS_PUBLIC_KEY'),
          ...(Deno.env.get('EMAILJS_PRIVATE_KEY') ? { accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY') } : {}),
          template_params: { to_email: instructor.email, ...copy },
        }),
      })
      provider_http_status = response.status
      status = response.ok ? 'accepted' : 'failed'
      if (!response.ok) failure_reason = 'EmailJS rejected the test invitation; no automatic retry.'
    } catch {
      failure_reason = 'EmailJS response unavailable; delivery is uncertain. Do not resend.'
    }
    const { error: updateError } = await db.from('class_cover_test_invitations')
      .update({ status, provider_http_status, failure_reason, updated_at: new Date().toISOString() })
      .eq('id', invitationId).eq('status', 'sending')
    if (updateError) throw updateError
    return Response.json({ invitation_id: invitationId, status }, { headers })
  } catch {
    console.error('Class-cover test invitation failed; inspect its recorded status before another action.')
    return Response.json({ error: 'Unable to complete the invitation. Check send history before trying again.' }, { status: 500, headers })
  }
}
