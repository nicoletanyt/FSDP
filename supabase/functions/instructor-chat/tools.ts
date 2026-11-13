import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

type Row = Record<string, unknown>
export type ChatSource = { label: string; href: string }
type ToolContext = { client: SupabaseClient; userId: string; sources: ChatSource[]; signal: AbortSignal }
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

function uuid(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Use a student UUID from search_students')
  return value
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
    if (name.startsWith('get_student')) uuid(args.student_id)
    offset(args.offset)
    if (name === 'search_students' && (typeof args.query !== 'string' || args.query.length > 200)) throw new Error('Search query must be at most 200 characters')
    if (name === 'get_student_history' && args.event_type !== undefined && !['class', 'seminar', 'workshop', 'grading'].includes(String(args.event_type))) throw new Error('Invalid event type')
    if (name === 'get_my_schedule' || name === 'get_my_availability') range(args)
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
