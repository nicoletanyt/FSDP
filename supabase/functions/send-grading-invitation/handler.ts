import { adminClient, authenticate, gradingHeaders } from '../_shared/grading.ts'
import { requireEnv } from '../_shared/stripe.ts'

const address = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const bccLimit = 50 // Conservative; connected email provider may impose a lower limit.

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
    if (!uuid.test(body?.event_id) || (body?.confirm !== true && body?.confirm !== false)) {
      return Response.json({ error: 'Select a grading event.' }, { status: 400, headers })
    }
    const db = adminClient()
    const { data: event, error: eventError } = await db.from('events')
      .select('name, starts_at, centres(name, address), gradings!inner(application_deadline)')
      .eq('id', body.event_id).single()
    if (eventError || !event) return Response.json({ error: 'Grading not found.' }, { status: 404, headers })
    const { data: eligible, error } = await db.rpc('eligible_grading_students', { target_event: body.event_id })
    if (error) throw error
    const emails = [...new Set([...(eligible ?? []).map((student: { email: string }) => student.email.trim().toLowerCase())
      .filter((email: string) => address.test(email) && !email.endsWith('@example.test') && email !== 'suroulomg@gmail.com'), 'mq07110@gmail.com'])]
    const preview = { event: event.name, eligible: eligible?.length ?? 0, bcc_count: emails.length, bcc_emails: emails }
    if (!body.confirm) return Response.json(preview, { headers })
    if (emails.length > bccLimit) return Response.json({ error: `BCC list exceeds the ${bccLimit}-address safety limit. Nothing sent.` }, { status: 400, headers })
    if (!eligible?.length) return Response.json({ error: 'No eligible students. Nothing sent.' }, { status: 400, headers })
    // Unique pending/accepted index makes concurrent confirmations a single send.
    const { data: send, error: reserveError } = await db.from('grading_email_sends')
      .insert({ grading_event_id: body.event_id, recipient_count: emails.length }).select('id').single()
    if (reserveError || !send) return Response.json({ error: 'Invitation already pending or accepted for this event.' }, { status: 409, headers })
    let accepted = false
    let failure = 'EmailJS rejected the invitation.'
    let ambiguous = false
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: requireEnv('EMAILJS_SERVICE_ID'), template_id: requireEnv('EMAILJS_TEMPLATE_ID'),
          user_id: requireEnv('EMAILJS_PUBLIC_KEY'),
          ...(Deno.env.get('EMAILJS_PRIVATE_KEY') ? { accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY') } : {}),
          template_params: {
            to_email: 'suroulomg@gmail.com', bcc_emails: emails.join(','),
            grading_date: new Date(event.starts_at).toLocaleDateString('en-SG', { timeZone: 'Asia/Singapore', dateStyle: 'long' }),
            grading_time: new Date(event.starts_at).toLocaleTimeString('en-SG', { timeZone: 'Asia/Singapore', timeStyle: 'short' }),
            grading_location: event.centres?.[0]?.name ?? '',
            application_deadline: event.gradings?.[0]?.application_deadline ?? '',
            application_url: `${config.appOrigin}/grading`,
          },
        }),
      })
      accepted = response.ok
      if (!accepted) failure = `EmailJS HTTP ${response.status}`
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
