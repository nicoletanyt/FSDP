import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const TEST_EMAIL = 'mq07110@gmail.com'

async function verifySignature(request: Request, payload: string, secret: string): Promise<boolean> {
  const id = request.headers.get('svix-id')
  const timestamp = request.headers.get('svix-timestamp')
  const signature = request.headers.get('svix-signature')
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const rawKey = secret.replace(/^whsec_/, '')
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(rawKey), (char) => char.charCodeAt(0))
  } catch { return false }
  const keyBytes = new Uint8Array(new ArrayBuffer(bytes.length))
  keyBytes.set(bytes)
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  // crypto.subtle.verify avoids early-exit comparisons against attacker-controlled signatures.
  for (const part of signature.split(' ')) {
    if (!part.startsWith('v1,')) continue
    try {
      const decoded = Uint8Array.from(atob(part.slice(3)), (char) => char.charCodeAt(0))
      const candidate = new Uint8Array(new ArrayBuffer(decoded.length))
      candidate.set(decoded)
      if (candidate.length === 32 && await crypto.subtle.verify('HMAC', key, candidate, new TextEncoder().encode(`${id}.${timestamp}.${payload}`))) return true
    } catch { /* Ignore malformed signature variants. */ }
  }
  return false
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed.', { status: 405, headers: { Allow: 'POST' } })
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  if (!secret) return new Response('Webhook not configured.', { status: 503 })
  const raw = await request.text()
  if (!await verifySignature(request, raw, secret)) return new Response('Invalid signature.', { status: 400 })

  try {
    const event: unknown = JSON.parse(raw)
    if (!event || typeof event !== 'object') return Response.json({ received: true })
    const { type, data } = event as Record<string, unknown>
    const status = type === 'email.delivered' ? 'delivered'
      : type === 'email.bounced' ? 'bounced'
      : type === 'email.failed' ? 'failed'
      : type === 'email.sent' ? 'sent' : null
    if (!status || !data || typeof data !== 'object') return Response.json({ received: true })
    const details = data as Record<string, unknown>
    const tag = details.tags && typeof details.tags === 'object'
      ? (details.tags as Record<string, unknown>).notification_id : null
    if (typeof tag !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(tag) ||
      typeof details.email_id !== 'string' || !Array.isArray(details.to) ||
      !details.to.includes(TEST_EMAIL)) return Response.json({ received: true })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data: recipient, error: readError } = await admin.from('notification_recipients')
      .select('id,status,provider_message_id').eq('notification_id', tag).eq('email', TEST_EMAIL).maybeSingle()
    if (readError) throw readError
    if (!recipient || (recipient.provider_message_id && recipient.provider_message_id !== details.email_id)) {
      return Response.json({ received: true })
    }
    // Terminal events win over delayed or replayed 'sent'/'delivered' events.
    if (recipient.status === 'bounced' || recipient.status === 'failed' ||
      (recipient.status === 'delivered' && status === 'sent')) return Response.json({ received: true })
    if (recipient.status === status) return Response.json({ received: true })
    const { error: updateError } = await admin.from('notification_recipients')
      .update({ status, provider_message_id: details.email_id }).eq('id', recipient.id)
    if (updateError) throw updateError
    const { error: summaryError } = await admin.from('notifications')
      .update({ delivered_count: status === 'delivered' ? 1 : 0,
        failed_count: status === 'failed' || status === 'bounced' ? 1 : 0 })
      .eq('id', tag)
    if (summaryError) throw summaryError
    return Response.json({ received: true })
  } catch {
    console.error('Resend webhook processing failed.')
    return new Response('Unable to process webhook.', { status: 500 })
  }
}
