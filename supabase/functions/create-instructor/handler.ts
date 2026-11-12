import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { instructorTitleLabels, isInstructorTitle, isTitleAllowed, titleRequirement } from '../_shared/instructor-titles.ts'

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

const instructorPlaceholders = ['first_name', 'login_url', 'email', 'password'] as const

function validInstructorTemplate(template: { subject: string; body: string } | null): template is { subject: string; body: string } {
  if (!template || typeof template.subject !== 'string' || typeof template.body !== 'string' ||
    !template.subject.trim() || template.subject.length > 150 || /[\r\n]/.test(template.subject) ||
    !template.body.trim() || template.body.length > 5000) return false
  return instructorPlaceholders.every(key => template.body.includes(`{{${key}}}`)) &&
    !template.body.replace(/\{\{(first_name|login_url|email|password)\}\}/g, '').match(/\{\{[^}]*\}\}/)
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
    const gradeId = typeof details.grade_id === 'string' ? details.grade_id.trim() : ''
    const title = details.instructor_title
    // Optional; omitted means not an examiner.
    const isExaminer = details.is_examiner ?? false
    if (
      !firstName || firstName.length > 100 || !lastName || lastName.length > 100 ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !gradeId ||
      !isInstructorTitle(title) || typeof isExaminer !== 'boolean'
    ) {
      return Response.json({
        error: 'Provide both names, a valid email address, a grade and an instructor title.',
      }, { status: 400, headers })
    }
    if (title !== 'none' && !isTitleAllowed(gradeId, title)) {
      return Response.json({
        error: `${instructorTitleLabels[title]} ${titleRequirement(title).replace(/^Requires/, 'requires')}.`,
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
    if (gradeId) {
      const { data: grade, error: gradeError } = await admin.from('grades').select('id, is_ranked').eq('id', gradeId).maybeSingle()
      if (gradeError) return Response.json({ error: 'Unable to verify the grade. Please try again.' }, { status: 500, headers })
      if (!grade || grade.is_ranked !== true) return Response.json({ error: 'Select a valid grade.' }, { status: 400, headers })
    }
    // Do not create an account if the delivery pipeline cannot even be attempted.
    const serviceId = Deno.env.get('EMAILJS_SERVICE_ID')?.trim()
    const templateId = Deno.env.get('EMAILJS_TEMPLATE_ID')?.trim()
    const publicKey = Deno.env.get('EMAILJS_PUBLIC_KEY')?.trim()
    if (!serviceId || !templateId || !publicKey) {
      return Response.json({ error: 'Instructor email delivery is not configured. No account was created.' }, { status: 503, headers })
    }
    const { data: template, error: templateError } = await admin.from('admin_email_templates')
      .select('subject,body').eq('id', 'instructor_account').single()
    if (templateError || !validInstructorTemplate(template)) {
      return Response.json({ error: 'Instructor login email template is unavailable. No account was created.' }, { status: 503, headers })
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
      // Never accept a role from the request body.
      app_metadata: {
        role: 'instructor',
        instructor_grade_id: gradeId,
        instructor_title: title,
        instructor_is_examiner: isExaminer,
      },
    })
    if (error || !data.user) {
      return Response.json({
        error: 'Unable to create the instructor. Check the details and whether the email is already registered.',
      }, { status: 400, headers })
    }

    // The account already exists at this point. A rejected or ambiguous provider
    // response must not be presented as a provisioning failure and retried.
    const instructorEmail = data.user.email ?? email
    const values: Record<(typeof instructorPlaceholders)[number], string> = {
      first_name: firstName,
      login_url: new URL('/staff/login', requiredEnv('APP_URL')).toString(),
      email: instructorEmail,
      password,
    }
    const emailBody = template.body.replace(/\{\{(first_name|login_url|email|password)\}\}/g,
      (_, key: (typeof instructorPlaceholders)[number]) => values[key])
    let emailStatus: 'accepted' | 'failed' | 'uncertain' = 'uncertain'
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          service_id: serviceId, template_id: templateId, user_id: publicKey,
          ...(Deno.env.get('EMAILJS_PRIVATE_KEY') ? { accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY') } : {}),
          template_params: {
            to_email: instructorEmail,
            email_subject: template.subject,
            email_body: emailBody,
          },
        }),
      })
      emailStatus = response.ok ? 'accepted' : 'failed'
    } catch {
      // The provider may have received the request; never retry automatically.
      emailStatus = 'uncertain'
    }

    return Response.json({ id: data.user.id, email: instructorEmail, password, email_status: emailStatus }, {
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
