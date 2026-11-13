import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

type Row = Record<string, unknown>
export type ChatSource = { label: string; href: string }
// A proposal only. The browser performs it with the instructor's own session after they press Confirm.
export type ChatAction =
  | { kind: 'endorse_student'; student_id: string; target_grade_id: string; label: string }
  | { kind: 'mark_attendance'; event_id: string; student_id: string; status: 'present' | 'absent'; label: string }
type ToolContext = { client: SupabaseClient; userId: string; sources: ChatSource[]; actions: ChatAction[]; signal: AbortSignal }
const MAX_ACTIONS = 3
const PAGE_SIZE = 20

function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid data response')
  return value as Row
}

function pick(value: unknown, keys: string[]) {
  if (value === null || value === undefined) return null
  const row = object(value)
  return Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key, row[key]]))
}

function student(value: unknown) {
  const row = object(value)
  return {
    ...pick(row, ['id', 'member_no', 'first_name', 'last_name', 'membership_status', 'joined_at', 'last_graded_at', 'outstanding_fees', 'follow_up_status']),
    grade: pick(row.grade, ['id', 'label']), centre: pick(row.centre, ['id', 'name']),
  }
}

function event(value: unknown) {
  const row = object(value)
  const grading = pick(row.grading, ['grading_date', 'application_deadline', 'application_status', 'reporting_release_on', 'reporting_time'])
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  if (grading && (typeof grading.reporting_release_on !== 'string' || grading.reporting_release_on > today)) grading.reporting_time = null
  return {
    ...pick(row, ['id', 'name', 'event_type', 'starts_at', 'ends_at', 'status']),
    centre: pick(row.centre, ['name']),
    grading,
  }
}

function page(value: unknown, project: (value: unknown) => unknown) {
  const data = object(value)
  if (!Array.isArray(data.items) || data.items.length > PAGE_SIZE || !Number.isSafeInteger(data.total)
      || Number(data.total) < 0 || !Number.isSafeInteger(data.offset)) throw new Error('Invalid page response')
  return {
    items: data.items.map(project), total: data.total, offset: data.offset,
    next_offset: Number(data.offset) + data.items.length < Number(data.total) ? Number(data.offset) + data.items.length : null,
  }
}

function uuid(value: unknown, hint = 'Use a student UUID from search_students') {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error(hint)
  return value
}
const eventHint = 'Use an event id from get_my_schedule or get_my_gradings'

function label(value: unknown) {
  return value && typeof value === 'object' ? (value as Row).label ?? null : null
}


function offset(value: unknown) {
  if (value === undefined) return 0
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 100_000) throw new Error('Invalid page offset')
  return Number(value)
}

function range(args: Row) {
  const date = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use YYYY-MM-DD dates')
    const parsed = new Date(`${value}T00:00:00Z`)
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Invalid date')
    return value
  }
  const from = date(args.from_date)
  const to = date(args.to_date)
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
  if (days <= 0 || days > 62) throw new Error('Use a date range of 1–62 days; to_date is exclusive')
  return { from, to }
}

const string = (description: string) => ({ type: 'string', description })
const pagination = { offset: { type: 'integer', minimum: 0, maximum: 100_000, description: 'Use next_offset to read the next page. Default 0.' } }
const dates = {
  from_date: string('Inclusive date in Asia/Singapore, YYYY-MM-DD.'),
  to_date: string('Exclusive date in Asia/Singapore, YYYY-MM-DD. At most 62 days after from_date.'),
  ...pagination,
}
function tool(name: string, description: string, properties: Row, required: string[]) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } }
}

export const chatTools = [
  tool('search_students', 'Find students by name or membership number. Empty query lists students. Returns current grade, membership and centre, not contact or medical details. Ask the user to disambiguate multiple matching names. Results are paginated, not a complete list.', { query: string('Name or member number, at most 200 characters; empty string to list.'), ...pagination }, ['query']),
  tool('get_student', 'Read a student profile and authoritative attendance totals across ended non-cancelled classes. Present and late count as attended; excused and unmarked do not belong in the attendance-rate denominator. No medical/contact details or assessment notes.', { student_id: string('UUID obtained from search_students.') }, ['student_id']),
  tool('get_student_history', 'Read past student sessions, attendance and assessment status, newest first, across instructors. Paginated; not an attendance aggregate. No free-text notes.', { student_id: string('UUID obtained from search_students.'), event_type: { type: 'string', enum: ['class', 'seminar', 'workshop', 'grading'] }, ...pagination }, ['student_id']),
  tool('get_my_schedule', 'Read ONLY the signed-in instructor’s assigned classes and events. Includes cancelled and date-only grading events; do not invent times for null timestamps. Paginated. No other instructor can be selected.', dates, ['from_date', 'to_date']),
  tool('get_class_roster', 'Read the enrolled students and their attendance for ONE class the signed-in instructor teaches. Get event_id from get_my_schedule first. attendance_status null means unmarked. Paginated. No report text, notes, contact or medical details.', { event_id: string('Class event id from get_my_schedule.'), ...pagination }, ['event_id']),
  tool('get_grading_readiness', 'Check whether a student meets every requirement for their next grade and whether an instructor has endorsed them for it. eligible=false means at least one requirement is unmet.', { student_id: string('UUID obtained from search_students.') }, ['student_id']),
  tool('get_my_gradings', 'List the gradings where the signed-in instructor sits on the examiner panel, with date, centre, chief examiner flag, candidate count and panel members. A null reporting_time means unpublished.', {}, []),
  tool('get_grading_candidates', 'List the candidates for ONE grading on the signed-in instructor’s examiner panel, with current and target grade. Get event_id from get_my_gradings. Paginated.', { event_id: string('Grading event id from get_my_gradings.'), ...pagination }, ['event_id']),
  tool('get_follow_up_students', 'List students taught by the signed-in instructor in the last 90 days whose most recent classes are consecutive absences, longest streak first. Use for questions about who needs a check-in or follow-up. Paginated.', { min_consecutive_absences: { type: 'integer', minimum: 1, maximum: 20, description: 'Minimum absence streak. Default 3.' }, ...pagination }, []),
  tool('propose_action', 'Propose ONE change for the instructor to confirm: endorse_student (endorse an eligible student for their next grade) or mark_attendance (mark a student present or absent in a class the instructor teaches that has not ended). This does NOT change anything; it shows the instructor a Confirm button. Never say the change was made.', {
    kind: { type: 'string', enum: ['endorse_student', 'mark_attendance'] },
    student_id: string('UUID obtained from search_students or get_class_roster.'),
    event_id: string('mark_attendance only: class event id from get_my_schedule.'),
    status: { type: 'string', enum: ['present', 'absent'], description: 'mark_attendance only.' },
  }, ['kind', 'student_id']),
  tool('get_my_availability', 'Read ONLY the signed-in instructor’s published availability. Available only to linked part-time instructors. Slots are availability, not booked classes. Paginated.', dates, ['from_date', 'to_date']),
]

export async function runTool(name: string, input: unknown, context: ToolContext): Promise<unknown> {
  const definition = chatTools.find(tool => tool.function.name === name)
  if (!definition) return { error: 'Unknown tool. Only the listed read-only tools are available.' }
  let args: Row
  try {
    args = object(input)
    const allowed = Object.keys(definition.function.parameters.properties)
    if (Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Unexpected tool argument')
    for (const key of definition.function.parameters.required) if (!(key in args)) throw new Error(`Missing ${key}`)
    // Validate all arguments before performing database reads.
    if (name.startsWith('get_student') || name === 'get_grading_readiness' || name === 'propose_action') uuid(args.student_id)
    if (name === 'propose_action') {
      if (args.kind === 'endorse_student') {
        if (args.event_id !== undefined || args.status !== undefined) throw new Error('endorse_student takes only student_id')
      } else if (args.kind === 'mark_attendance') {
        uuid(args.event_id, eventHint)
        if (args.status !== 'present' && args.status !== 'absent') throw new Error('status must be present or absent')
      } else throw new Error('kind must be endorse_student or mark_attendance')
    }
    if (name === 'get_class_roster' || name === 'get_grading_candidates') uuid(args.event_id, eventHint)
    offset(args.offset)
    if (name === 'search_students' && (typeof args.query !== 'string' || args.query.length > 200)) throw new Error('Search query must be at most 200 characters')
    if (name === 'get_student_history' && args.event_type !== undefined && !['class', 'seminar', 'workshop', 'grading'].includes(String(args.event_type))) throw new Error('Invalid event type')
    if (name === 'get_my_schedule' || name === 'get_my_availability') range(args)
    if (name === 'get_follow_up_students' && args.min_consecutive_absences !== undefined
        && (!Number.isSafeInteger(args.min_consecutive_absences) || Number(args.min_consecutive_absences) < 1 || Number(args.min_consecutive_absences) > 20)) throw new Error('Use a minimum absence streak from 1 to 20')
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid tool arguments' }
  }

  const { client, sources, signal } = context
  const addSource = (label: string, href: string) => {
    if (!sources.some(source => source.href === href)) sources.push({ label, href })
  }
  const rpc = async (rpcName: string, parameters: Row) => {
    const { data, error } = await client.rpc(rpcName, parameters).abortSignal(signal)
    if (error || data === null) throw new Error('Database read failed')
    return data
  }
  // Permission/validation errors raised by the RPC become a tool error the model can explain,
  // instead of failing the whole reply. Other failures still fail closed.
  const guardedRpc = async (rpcName: string, parameters: Row, denied: string) => {
    const { data, error } = await client.rpc(rpcName, parameters).abortSignal(signal)
    if (error && ['42501', '22023', 'PGP01', 'P0001'].includes(String(error.code))) return { denied }
    if (error || data === null) throw new Error('Database read failed')
    return { data }
  }

  // This client carries the caller JWT. All reads remain subject to existing RLS.
  if (name === 'search_students') {
    const result = page(await rpc('instructor_student_directory', { search_text: args.query, page_size: PAGE_SIZE, page_offset: offset(args.offset) }), student)
    addSource('Student directory', '/instructor/students')
    return result
  }
  if (name === 'get_student') {
    const id = uuid(args.student_id)
    const { data, error } = await client.from('students')
      .select('id, member_no, first_name, last_name, membership_status, joined_at, last_graded_at, outstanding_fees, follow_up_status, grade:grades(id,label), centre:centres(id,name)')
      .eq('id', id).abortSignal(signal).maybeSingle()
    if (error) throw new Error('Database read failed')
    if (!data) return { error: 'Student not found or not accessible.' }
    const raw = object(await rpc('instructor_student_summary', { target_student: id }))
    const summary = pick(raw, ['pastSessions', 'present', 'late', 'absent', 'excused', 'unmarked', 'periodStart', 'periodEnd', 'cycleStart', 'cycleAttended', 'consecutiveAbsences'])
    const last = raw.lastAttended ? object(raw.lastAttended) : null
    addSource(`${data.first_name} ${data.last_name}`, `/instructor/students/${id}`)
    return { student: student(data), attendance: { ...summary, lastAttended: last ? event({ ...object(last.event), centre: last.centre }) : null } }
  }
  if (name === 'get_student_history') {
    const id = uuid(args.student_id)
    const result = page(await rpc('instructor_student_history', {
      target_student: id, page_size: PAGE_SIZE, page_offset: offset(args.offset), filter_type: args.event_type ?? null,
    }), value => {
      const row = object(value)
      return {
        record: pick(row.record, ['attendance_status', 'checked_in_at', 'assessment_status']),
        event: event({ ...object(row.event), centre: row.centre, grading: row.grading }),
        instructor: pick(row.instructor, ['first_name', 'last_name']), target_grade: pick(row.targetGrade, ['label']),
      }
    })
    addSource('Student session history', `/instructor/students/${id}`)
    return result
  }

  if (name === 'get_class_roster') {
    const id = uuid(args.event_id, eventHint)
    const { data: me, error: meError } = await client.from('instructors').select('id').eq('user_id', context.userId).abortSignal(signal).maybeSingle()
    if (meError) throw new Error('Instructor lookup failed')
    if (!me) return { error: 'No instructor record is linked to this account.' }
    const { data: session, error: sessionError } = await client.from('events')
      .select('id, name, event_type, status, starts_at, ends_at, instructor_id').eq('id', id).abortSignal(signal).maybeSingle()
    if (sessionError) throw new Error('Database read failed')
    if (!session || session.instructor_id !== me.id || session.event_type !== 'class') return { error: 'This class is not assigned to you or is not a class event.' }
    // Same table read as the app's roster view; RLS limits rows to events this instructor teaches.
    const start = offset(args.offset)
    const { data, error: rosterError, count } = await client.from('event_students')
      .select('attendance_status, checked_in_at, student:students(id, member_no, first_name, last_name, grade:grades(label))', { count: 'exact' })
      .eq('event_id', id).order('student_id').range(start, start + PAGE_SIZE - 1).abortSignal(signal)
    if (rosterError) throw new Error('Database read failed')
    const roster = page({ items: data, total: count, offset: start }, value => {
      const row = object(value)
      const person = object(row.student)
      return {
        student: { ...pick(person, ['id', 'member_no', 'first_name', 'last_name']), grade: label(person.grade) },
        attendance_status: row.attendance_status ?? null,
        checked_in_at: row.checked_in_at ?? null,
      }
    })
    if (typeof session.starts_at === 'string') {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(session.starts_at))
      addSource('Your calendar', `/instructor/calendar?date=${day}`)
    }
    return { event: event(session), ...roster }
  }
  if (name === 'get_grading_readiness') {
    const id = uuid(args.student_id)
    const result = await guardedRpc('grading_endorsement_status', { target_student: id }, 'Grading readiness is unavailable for this account or student.')
    if ('denied' in result) return { error: result.denied }
    const status = object(result.data)
    addSource('Student grading', `/instructor/students/${id}`)
    return {
      student_id: id, next_grade_id: status.target_grade_id ?? null, eligible: status.eligible === true,
      endorsement: pick(status.endorsement, ['endorsed_at', 'endorsed_by']),
    }
  }
  if (name === 'get_follow_up_students') {
    const minimum = args.min_consecutive_absences === undefined ? 3 : Number(args.min_consecutive_absences)
    const result = await guardedRpc('instructor_follow_up_students', { min_absences: minimum, page_size: PAGE_SIZE, page_offset: offset(args.offset) },
      'No instructor record is linked to this account.')
    if ('denied' in result) return { unavailable: result.denied }
    addSource('Student directory', '/instructor/students')
    return { min_consecutive_absences: minimum, window: 'students taught in the last 90 days', ...page(result.data, value =>
      pick(value, ['student_id', 'member_no', 'first_name', 'last_name', 'grade', 'consecutive_absences', 'last_attended_on'])) }
  }
  if (name === 'get_my_gradings') {
    const result = await guardedRpc('my_grading_panels', {}, 'No instructor record is linked to this account.')
    if ('denied' in result) return { unavailable: result.denied }
    if (!Array.isArray(result.data)) throw new Error('Invalid grading response')
    addSource('Your gradings', '/instructor/gradings')
    return { items: result.data.slice(0, 50).map(value => {
      const row = object(value)
      return {
        ...pick(row, ['event_id', 'name', 'status', 'track', 'grading_date', 'starts_at', 'ends_at', 'reporting_time', 'is_chief', 'candidates']),
        centre: pick(row.centre, ['name']),
        panel: Array.isArray(row.panel) ? row.panel.map(member => pick(member, ['name', 'is_chief'])) : [],
      }
    }), total: result.data.length, timezone: 'Asia/Singapore' }
  }
  if (name === 'get_grading_candidates') {
    const id = uuid(args.event_id, eventHint)
    const result = await guardedRpc('examiner_grading_day', { target_event: id }, 'Only examiners on this grading’s panel can see its candidates.')
    if ('denied' in result) return { error: result.denied }
    const day = object(result.data)
    addSource(typeof day.name === 'string' ? day.name.slice(0, 100) : 'Grading day', `/instructor/gradings/${id}`)
    const students = Array.isArray(day.students) ? day.students : []
    const start = offset(args.offset)
    return {
      event_id: id, name: day.name ?? null, grading_date: day.grading_date ?? null,
      ...page({ items: students.slice(start, start + PAGE_SIZE), total: students.length, offset: start }, value => {
        const row = object(value)
        return {
          ...pick(row, ['student_id', 'name', 'member_no', 'candidate_number']),
          current_grade: label(row.current_grade), target_grade: label(row.target_grade),
        }
      }),
    }
  }

  if (name === 'propose_action') {
    if (context.actions.length >= MAX_ACTIONS) return { error: `At most ${MAX_ACTIONS} changes can be proposed per reply. Ask the instructor to confirm these first.` }
    const studentId = uuid(args.student_id)
    if (context.actions.some(action => action.student_id === studentId && action.kind === args.kind)) return { error: 'This change is already proposed.' }
    const { data: person, error: personError } = await client.from('students').select('first_name, last_name')
      .eq('id', studentId).abortSignal(signal).maybeSingle()
    if (personError) throw new Error('Database read failed')
    if (!person) return { error: 'Student not found or not accessible.' }
    const fullName = `${person.first_name} ${person.last_name}`.trim()
    const note = 'Proposed only. Tell the instructor to review and press Confirm; nothing has changed yet.'

    if (args.kind === 'endorse_student') {
      const result = await guardedRpc('grading_endorsement_status', { target_student: studentId }, 'Endorsements are unavailable for this account.')
      if ('denied' in result) return { error: result.denied }
      const status = object(result.data)
      if (typeof status.target_grade_id !== 'string') return { error: `${fullName} has no next grade to endorse.` }
      if (status.eligible !== true) return { error: `${fullName} does not meet every requirement for their next grade yet, so they cannot be endorsed.` }
      if (status.endorsement) return { error: `${fullName} is already endorsed for their next grade.` }
      const { data: grade } = await client.from('grades').select('label').eq('id', status.target_grade_id).abortSignal(signal).maybeSingle()
      const action: ChatAction = { kind: 'endorse_student', student_id: studentId, target_grade_id: status.target_grade_id,
        label: `Endorse ${fullName} for ${grade?.label ?? 'their next grade'}`.slice(0, 120) }
      context.actions.push(action)
      return { proposed: action.label, note }
    }

    const eventId = uuid(args.event_id, eventHint)
    const { data: me, error: meError } = await client.from('instructors').select('id').eq('user_id', context.userId).abortSignal(signal).maybeSingle()
    if (meError) throw new Error('Instructor lookup failed')
    if (!me) return { error: 'No instructor record is linked to this account.' }
    const { data: entry, error: entryError } = await client.from('event_students')
      .select('attendance_status, event:events(name, event_type, status, starts_at, ends_at, instructor_id)')
      .eq('event_id', eventId).eq('student_id', studentId).abortSignal(signal).maybeSingle()
    if (entryError) throw new Error('Database read failed')
    const session = entry ? object(entry.event) : null
    if (!entry || !session || session.instructor_id !== me.id) return { error: `${fullName} is not on the roster of a class you teach with that event id.` }
    if (session.event_type !== 'class' || session.status !== 'scheduled' || typeof session.ends_at !== 'string' || Date.parse(session.ends_at) <= Date.now()) {
      return { error: 'Attendance can only be changed for a scheduled class that has not ended yet.' }
    }
    if (entry.attendance_status === 'late' || entry.attendance_status === 'excused') return { error: `${fullName} is marked ${entry.attendance_status}; that entry is read-only.` }
    if (entry.attendance_status === args.status) return { error: `${fullName} is already marked ${args.status}.` }
    const when = typeof session.starts_at === 'string' ? new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(session.starts_at)) : ''
    const action: ChatAction = { kind: 'mark_attendance', event_id: eventId, student_id: studentId, status: args.status as 'present' | 'absent',
      label: `Mark ${fullName} ${args.status} · ${session.name ?? 'class'}${when ? ` (${when})` : ''}`.slice(0, 120) }
    context.actions.push(action)
    return { proposed: action.label, note }
  }

  const { data: identity, error } = await client.from('instructors').select('id, employment_type')
    .eq('user_id', context.userId).abortSignal(signal).maybeSingle()
  if (error) throw new Error('Instructor lookup failed')
  if (!identity) return { unavailable: 'No instructor record is linked to this account. Student tools are still available.' }
  const { from, to } = range(args)
  if (name === 'get_my_schedule') {
    const result = page(await rpc('instructor_calendar', {
      range_from: `${from}T00:00:00+08:00`, range_to: `${to}T00:00:00+08:00`,
      page_size: PAGE_SIZE, page_offset: offset(args.offset),
    }), value => {
      if (object(value).instructor_id !== identity.id) throw new Error('Mismatched instructor')
      return event(value)
    })
    addSource('Your calendar', `/instructor/calendar?date=${from}`)
    return { ...result, timezone: 'Asia/Singapore', from_date: from, to_date_exclusive: to }
  }
  if (identity.employment_type !== 'part_time') return { unavailable: 'Availability is available only for part-time instructors, not this account.' }
  const start = offset(args.offset)
  const { data, error: readError, count } = await client.from('instructor_availability')
    .select('id, date, start_time, end_time', { count: 'exact' }).eq('instructor_id', identity.id)
    .gte('date', from).lt('date', to).order('date').order('start_time').order('id')
    .range(start, start + PAGE_SIZE - 1).abortSignal(signal)
  if (readError) throw new Error('Availability read failed')
  const result = page({ items: data, total: count, offset: start }, value => pick(value, ['date', 'start_time', 'end_time']))
  addSource('Your availability', `/instructor/calendar?date=${from}`)
  return { ...result, timezone: 'Asia/Singapore', from_date: from, to_date_exclusive: to }
}
