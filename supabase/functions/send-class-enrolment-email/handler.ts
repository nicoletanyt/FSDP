import { adminClient, authenticate, gradingHeaders } from '../_shared/grading.ts'
import { sendStudentEmail, type StudentMessage } from '../_shared/student-emailjs.ts'

type Student = { id: string; email: string; first_name: string; last_name: string }
type Session = {
  id: string; name: string; starts_at: string; ends_at: string; status: string
  centres: { name: string } | null
  instructors: { first_name: string; last_name: string } | null
}

export type Dependencies = {
  headers: (request: Request) => { allowed: boolean; headers: Record<string, string> }
  authenticate: typeof authenticate
  loadStudent: (userId: string) => Promise<Student | null>
  loadBooking: (eventId: string, studentId: string) => Promise<{ moved_from_event_id: string | null } | null>
  loadSession: (eventId: string) => Promise<Session | null>
  send: (message: StudentMessage, key: string) => Promise<string>
}

const defaults: Dependencies = {
  headers: gradingHeaders,
  authenticate,
  async loadStudent(userId) {
    const { data, error } = await adminClient().from('students')
      .select('id,email,first_name,last_name').eq('user_id', userId).maybeSingle<Student>()
    if (error) throw new Error('Student lookup failed.')
    return data
  },
  async loadBooking(eventId, studentId) {
    const { data, error } = await adminClient().from('event_students')
      .select('moved_from_event_id').eq('event_id', eventId).eq('student_id', studentId)
      .maybeSingle<{ moved_from_event_id: string | null }>()
    if (error) throw new Error('Booking lookup failed.')
    return data
  },
  async loadSession(eventId) {
    const { data, error } = await adminClient().from('events')
      .select('id,name,starts_at,ends_at,status,centres(name),instructors(first_name,last_name),classes!inner(event_id)')
      .eq('id', eventId).eq('event_type', 'class').maybeSingle()
    if (error) throw new Error('Class lookup failed.')
    return data as Session | null
  },
  send: sendStudentEmail,
}

const date = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', day: 'numeric', month: 'long', year: 'numeric',
})
const day = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', weekday: 'long' })
const time = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i

export function enrolmentMessage(student: Student, session: Session): StudentMessage {
  const name = [student.first_name, student.last_name].filter(Boolean).join(' ') || 'there'
  const instructor = session.instructors
    ? `${session.instructors.first_name} ${session.instructors.last_name}`.trim()
    : 'Coach to be announced'
  return {
    to: student.email,
    subject: 'Class enrolment confirmed – Aikido Shinju-Kai',
    text: `Dear ${name},\n\nYour class enrolment is confirmed.\n\nClass: ${session.name}\nDate: ${date.format(new Date(session.starts_at))}, ${day.format(new Date(session.starts_at))}\nTime: ${time.format(new Date(session.starts_at))} - ${time.format(new Date(session.ends_at))}\nCentre: ${session.centres?.name ?? 'To be announced'}\nInstructor: ${instructor}\n\nYou can view your booking in the student portal.\n\nAikido Shinju-Kai`,
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
    if (!userId) return Response.json({ error: 'Student sign-in required.' }, { status: 401, headers })

    let eventId: unknown
    try {
      const raw = await request.text()
      if (raw.length > 1024) throw new Error('Request too large.')
      const body: unknown = JSON.parse(raw)
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body.')
      eventId = (body as Record<string, unknown>).event_id
    } catch {
      return Response.json({ error: 'Invalid class request.' }, { status: 400, headers })
    }
    if (typeof eventId !== 'string' || !uuidPattern.test(eventId)) {
      return Response.json({ error: 'Invalid class request.' }, { status: 400, headers })
    }

    const student = await dependencies.loadStudent(userId)
    if (!student?.email) return Response.json({ error: 'Student account not found.' }, { status: 404, headers })
    const booking = await dependencies.loadBooking(eventId, student.id)
    // Rescheduling inserts a new roster entry too, but is not a new enrolment email.
    if (!booking || booking.moved_from_event_id) {
      return Response.json({ error: 'Enrolment not found.' }, { status: 404, headers })
    }
    const session = await dependencies.loadSession(eventId)
    if (!session || session.status !== 'scheduled' || new Date(session.starts_at).getTime() <= Date.now()) {
      return Response.json({ error: 'Class is not available.' }, { status: 404, headers })
    }

    const result = await dependencies.send(enrolmentMessage(student, session), `class-enrolment/${student.id}/${eventId}/v1`)
    return Response.json({ status: result === 'already-reserved' ? 'already-reserved' : 'accepted' }, { headers })
  } catch {
    // Do not log recipients, booking details or provider responses.
    console.error('Class enrolment confirmation email could not be sent.')
    return Response.json({ error: 'Unable to send class confirmation email.' }, { status: 502, headers })
  }
}
