import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

export async function handleRequest(request: Request): Promise<Response> {
  let headers: Record<string, string> = {}

  try {
    const origins = [
      requiredEnv('APP_URL'),
      ...(Deno.env.get('AUTH_ALLOWED_ORIGINS') ?? '').split(','),
    ].filter(Boolean).map((value) => new URL(value.trim()).origin)
    const origin = request.headers.get('origin')
    headers = {
      'Access-Control-Allow-Origin': origin && origins.includes(origin) ? origin : origins[0],
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin',
      'Cache-Control': 'no-store',
    }

    if (origin && !origins.includes(origin)) {
      return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed.' }, {
        status: 405, headers: { ...headers, Allow: 'POST, OPTIONS' },
      })
    }

    const authorization = request.headers.get('authorization')
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1]
    if (!token) {
      return Response.json({ error: 'Sign in to continue.' }, { status: 401, headers })
    }

    const url = requiredEnv('SUPABASE_URL')
    const caller = createClient(url, requiredEnv('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data: { user }, error: userError } = await caller.auth.getUser(token)
    if (userError || !user) {
      return Response.json({ error: 'Your session is invalid or expired.' }, {
        status: 401, headers,
      })
    }

    const { data: profile, error: profileError } = await caller
      .from('users').select('role').eq('id', user.id).single()
    if (profileError) {
      return Response.json({ error: 'Unable to verify account permissions.' }, {
        status: 500, headers,
      })
    }
    if (profile?.role !== 'administrator') {
      return Response.json({ error: 'Administrator access is required.' }, {
        status: 403, headers,
      })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'A JSON request body is required.' }, {
        status: 400, headers,
      })
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Invalid instructor details.' }, { status: 400, headers })
    }

    const details = body as Record<string, unknown>
    const firstName = typeof details.first_name === 'string' ? details.first_name.trim() : ''
    const lastName = typeof details.last_name === 'string' ? details.last_name.trim() : ''
    const email = typeof details.email === 'string' ? details.email.trim().toLowerCase() : ''
    if (
      !firstName || firstName.length > 100 || !lastName || lastName.length > 100 ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return Response.json({
        error: 'Provide both names and a valid email address.',
      }, { status: 400, headers })
    }

    // 192 random bits; the prefix also satisfies password character-class rules.
    // Ignore any client-supplied password and never log or persist this value.
    const password = 'Aa1!' + Array.from(
      crypto.getRandomValues(new Uint8Array(24)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('')

    const admin = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
      // Never accept a role from the request body.
      app_metadata: { role: 'instructor' },
    })
    if (error || !data.user) {
      return Response.json({
        error: 'Unable to create the instructor. Check the details and whether the email is already registered.',
      }, { status: 400, headers })
    }

    return Response.json({ id: data.user.id, email: data.user.email, password }, {
      status: 201, headers,
    })
  } catch {
    // Do not log request bodies, passwords, tokens, or privileged credentials.
    console.error('Instructor account provisioning failed.')
    return Response.json({ error: 'Unable to create the instructor right now.' }, {
      status: 500, headers,
    })
  }
}
