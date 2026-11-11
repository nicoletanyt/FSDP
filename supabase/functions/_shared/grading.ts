import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { requireEnv } from './stripe.ts'

export function adminClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function gradingHeaders(request: Request) {
  const allowed = [requireEnv('APP_URL'), ...(Deno.env.get('AUTH_ALLOWED_ORIGINS') ?? '').split(',')]
    .filter(Boolean).map((item) => new URL(item.trim()).origin)
  const origin = request.headers.get('origin')
  const allowedOrigin = origin && allowed.includes(origin) ? origin : null
  return {
    allowed: !origin || !!allowedOrigin,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin ?? allowed[0],
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store', 'Vary': 'Origin',
    },
    // Stripe returns the student to the site they started checkout from
    // (e.g. localhost while developing), but only if that site is allow-listed.
    appOrigin: allowedOrigin ?? new URL(requireEnv('APP_URL')).origin,
  }
}

export async function authenticate(request: Request, role: 'student' | 'administrator') {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!token) return null
  const caller = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user }, error } = await caller.auth.getUser(token)
  if (error || !user) return null
  const { data: profile, error: profileError } = await caller.from('users').select('role').eq('id', user.id).single()
  if (profileError || profile?.role !== role) return null
  return user.id
}
