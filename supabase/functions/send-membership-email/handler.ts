import { Resend } from 'npm:resend@6.38.0'
import { adminClient, authenticate, gradingHeaders } from '../_shared/grading.ts'
import { requireEnv } from '../_shared/stripe.ts'

type Member = {
  id: string
  email: string
  first_name: string
  last_name: string
  member_no: string
}

type Message = { to: string; subject: string; html: string; text: string }
export type Dependencies = {
  headers: (request: Request) => { allowed: boolean; headers: Record<string, string> }
  authenticate: typeof authenticate
  loadMember: (userId: string) => Promise<Member | null>
  send: (message: Message, key: string) => Promise<string>
}

const defaults: Dependencies = {
  headers: gradingHeaders,
  authenticate,
  async loadMember(userId) {
    const { data, error } = await adminClient().from('students')
      .select('id, email, first_name, last_name, member_no')
      .eq('user_id', userId).maybeSingle()
    if (error) throw new Error('Membership lookup failed.')
    return data
  },
  async send(message, key) {
    const resend = new Resend(requireEnv('RESEND_API_KEY'))
    const { data, error } = await resend.emails.send({
      from: requireEnv('MEMBERSHIP_EMAIL_FROM'),
      ...message,
    }, { idempotencyKey: key })
    if (error || !data?.id) throw new Error('Email provider rejected the request.')
    return data.id
  },
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!)
}

export function membershipMessage(member: Member): Message {
  const name = [member.first_name, member.last_name].filter(Boolean).join(' ')
  return {
    to: member.email,
    subject: 'Welcome to Aikido Shinju-Kai!',
    html: `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#24324a">
  <main style="max-width:560px;margin:32px auto;padding:32px;background:#ffffff;border-radius:16px">
    <h1 style="font-size:24px;color:#2c3f67">Welcome to Aikido Shinju-Kai!</h1>
    <p>Dear ${escapeHtml(name)},</p>
    <p>Thank you for joining Aikido Shinju-Kai. We have received your membership application.</p>
    <p>Your Membership ID:</p>
    <p style="padding:20px;background:#eef2f8;border-radius:8px;font-size:26px;font-weight:bold;color:#2c3f67;letter-spacing:1px">${escapeHtml(member.member_no)}</p>
    <h2 style="font-size:18px">Payment Instructions</h2>
    <p>You will receive your payment instructions within <strong>one business day</strong>. Please check your inbox and spam folder.</p>
    <p>Your application is pending review. This email is confirmation of submission, not confirmation of payment or membership activation.</p>
    <p>We look forward to welcoming you to the dojo!</p>
    <p>Aikido Shinju-Kai Membership Team</p>
  </main>
</body></html>`,
    text: `Dear ${name},\n\nWelcome to Aikido Shinju-Kai!\nWe have received your membership application.\n\nYour Membership ID: ${member.member_no}\n\nPayment Instructions\nYou will receive your payment instructions within one business day. Please check your inbox and spam folder.\n\nYour application is pending review. This is not confirmation of payment or membership activation.\n\nAikido Shinju-Kai Membership Team`,
  }
}

export async function handleRequest(request: Request, dependencies: Dependencies = defaults): Promise<Response> {
  let headers: Record<string, string> = {}
  try {
    const config = dependencies.headers(request)
    headers = config.headers
    if (!config.allowed) return Response.json({ error: 'Origin not allowed.' }, { status: 403, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers })
    const userId = await dependencies.authenticate(request, 'student')
    if (!userId) return Response.json({ error: 'Student authentication required.' }, { status: 401, headers })

    let body: Record<string, unknown>
    try {
      const raw = await request.text()
      if (raw.length > 4096) throw new Error('Request too large.')
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid body.')
      body = parsed
    } catch {
      return Response.json({ error: 'Invalid email request.' }, { status: 400, headers })
    }
    if (typeof body.email !== 'string' || body.email.length > 254 ||
      !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(body.email) ||
      typeof body.name !== 'string' || !body.name.trim() || body.name.length > 201 ||
      typeof body.membershipId !== 'string' || !body.membershipId || body.membershipId.length > 100) {
      return Response.json({ error: 'Email, name and membershipId are required.' }, { status: 400, headers })
    }

    // Never trust the browser to choose another recipient or invent a member ID.
    const member = await dependencies.loadMember(userId)
    if (!member) return Response.json({ error: 'Submit your membership application first.' }, { status: 404, headers })
    if (member.email.trim().toLowerCase() !== body.email.trim().toLowerCase() || member.member_no !== body.membershipId) {
      return Response.json({ error: 'Email or membership ID does not match your application.' }, { status: 403, headers })
    }
    const id = await dependencies.send(membershipMessage(member), `membership-welcome/${member.id}/${member.member_no}/v1`)
    return Response.json({ status: 'accepted', id }, { headers })
  } catch {
    // Do not log provider responses, credentials, tokens or applicant details.
    console.error('Membership confirmation email could not be sent.')
    return Response.json({ error: 'Unable to send confirmation email.' }, { status: 502, headers })
  }
}
