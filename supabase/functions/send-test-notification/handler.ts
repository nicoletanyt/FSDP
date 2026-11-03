import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const TEST_EMAIL = 'mq07110@gmail.com'
const subjects = {
  grading_invitation: 'Aikido Shinju-Kai: Grading invitation',
  attendance_concern: 'Aikido Shinju-Kai: Attendance concern',
  general_reminder: 'Aikido Shinju-Kai: General reminder',
} as const

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = {}
  try {
    const origins = [requiredEnv('APP_URL'), ...(Deno.env.get('AUTH_ALLOWED_ORIGINS') ?? '').split(',')]
      .filter(Boolean).map((origin) => new URL(origin.trim()).origin)
    const origin = request.headers.get('origin')
    headers = {
      'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : origins[0],
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
    }
    if (origin && !origins.includes(origin)) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers })

    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!token) return Response.json({ error: 'Sign in to continue.' }, { status: 401, headers })
    const url = requiredEnv('SUPABASE_URL')
    const caller = createClient(url, requiredEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data: { user }, error: authError } = await caller.auth.getUser(token)
    if (authError || !user) return Response.json({ error: 'Session expired.' }, { status: 401, headers })
    const { data: profile, error: profileError } = await caller.from('users').select('role').eq('id', user.id).single()
    if (profileError || profile?.role !== 'administrator') return Response.json({ error: 'Administrator access required.' }, { status: 403, headers })

    let body: unknown
    try { body = await request.json() } catch { return Response.json({ error: 'Invalid request.' }, { status: 400, headers }) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Invalid request.' }, { status: 400, headers })
    const input = body as Record<string, unknown>
    const template = input.template
    const message = typeof input.message === 'string' ? input.message.trim() : ''
    if (typeof template !== 'string' || !(template in subjects) || !message || message.length > 5000) {
      return Response.json({ error: 'Choose a template and enter a message of up to 5,000 characters.' }, { status: 400, headers })
    }

    // Fail closed if the sender isn't configured; do not create misleading history.
    const from = requiredEnv('RESEND_FROM_EMAIL')
    const apiKey = requiredEnv('RESEND_API_KEY')
    const admin = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const subject = subjects[template as keyof typeof subjects]
    const { data: notification, error: insertError } = await admin.from('notifications')
      .insert({ template, subject, audience_label: 'Resend test email', recipient_count: 1 })
      .select('id').single()
    if (insertError || !notification) throw new Error('Unable to create notification')
    const { error: recipientError } = await admin.from('notification_recipients')
      .insert({ notification_id: notification.id, email: TEST_EMAIL })
    if (recipientError) throw new Error('Unable to create recipient')

    let providerId: string | undefined
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': notification.id,
        },
        body: JSON.stringify({ from, to: [TEST_EMAIL], subject, text: message,
          tags: [{ name: 'notification_id', value: notification.id }] }),
      })
      const result: unknown = await response.json()
      if (response.ok && result && typeof result === 'object' && 'id' in result && typeof result.id === 'string') {
        providerId = result.id
      }
    } catch { /* Treat provider failures as failed attempts, without logging the message. */ }

    const { error: updateError } = await admin.from('notification_recipients')
      .update(providerId ? { provider_message_id: providerId, status: 'sent' } : { status: 'failed', error: 'Provider rejected the send.' })
      .eq('notification_id', notification.id).eq('status', 'pending')
    if (updateError) throw new Error('Unable to update recipient')
    const { error: summaryError } = await admin.from('notifications')
      .update(providerId ? { sent_at: new Date().toISOString() } : { failed_count: 1 })
      .eq('id', notification.id)
    if (summaryError) throw new Error('Unable to update notification')
    if (!providerId) return Response.json({ error: 'Resend did not accept the email. Check the sender and API key.' }, { status: 502, headers })
    return Response.json({ id: notification.id, recipient: TEST_EMAIL, status: 'sent' }, { headers })
  } catch {
    console.error('Test notification failed.')
    return Response.json({ error: 'Unable to send the test email. Check function configuration.' }, { status: 500, headers })
  }
}
