import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const tagPattern = /^[0-9a-f]{64}$/i
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
// Temporary exact origin for local phone testing. Remove and redeploy afterward.
const httpTestOrigin = 'http://192.168.1.13:5173'

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function hashTag(token: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token.toLowerCase()))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
  try {
    const origins = [requiredEnv('APP_URL'), ...(Deno.env.get('AUTH_ALLOWED_ORIGINS') ?? '').split(','), httpTestOrigin]
      .filter(Boolean).map((value) => new URL(value.trim()).origin)
    const origin = request.headers.get('origin')
    headers = {
      ...headers,
      'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : origins[0],
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
    }
    if (origin && !origins.includes(origin)) {
      return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers })

    const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!token) return Response.json({ error: 'Sign in as an instructor.' }, { status: 401, headers })
    const url = requiredEnv('SUPABASE_URL')
    const caller = createClient(url, requiredEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await caller.auth.getUser(token)
    if (authError || !user) return Response.json({ error: 'Session expired. Sign in again.' }, { status: 401, headers })
    const { data: profile, error: roleError } = await caller.from('users').select('role').eq('id', user.id).single()
    if (roleError) throw roleError
    if (profile?.role !== 'instructor') return Response.json({ error: 'Instructor access required.' }, { status: 403, headers })

    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid request.' }, { status: 400, headers })
    }
    const input = body as Record<string, unknown>
    if (input.action !== 'scan' || typeof input.tag !== 'string' || !tagPattern.test(input.tag) ||
        (input.event_id != null && (typeof input.event_id !== 'string' || !uuidPattern.test(input.event_id)))) {
      return Response.json({ error: 'Invalid tag or class.' }, { status: 400, headers })
    }
    const db = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await db.rpc('nfc_scan_attendance', {
      p_actor: user.id, p_tag_id: await hashTag(input.tag), p_event: input.event_id ?? null,
    })
    if (error) throw error
    const status = data?.status as string | undefined
    const code = ['marked', 'upcoming', 'absent', 'excused', 'no_class', 'select_class'].includes(status ?? '') ? 200
      : status === 'invalid' ? 404 : status === 'forbidden' || status === 'unlinked' || status === 'wrong_class' ? 403 : 500
    return Response.json(data ?? { error: 'Scan unavailable.' }, { status: code, headers })
  } catch {
    // Never log tag URLs, bearer tokens or request bodies.
    console.error('NFC scan failed.')
    return Response.json({ error: 'Unable to check attendance. Try again.' }, { status: 500, headers })
  }
}
