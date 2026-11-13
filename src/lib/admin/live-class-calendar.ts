import type { AdminCalendarEvent } from './attendance-calendar'
import type { Centre, SessionType } from './types'
import { supabase } from '@/lib/supabase'
import { rosterAttendance } from '@/lib/instructor/calendar-view'
import { decodeRosterEntry } from '@/lib/instructor/decoders'
import type { AttendanceState, GradeRow } from '@/lib/instructor/types'

type CentreRow = { id: string; name: string; short_name: string; address: string; timezone: string; status: Centre['status'] }
type EventRow = {
  id: string; centre_id: string; instructor_id: string | null; name: string
  starts_at: string; ends_at: string; status: string
  instructors: { first_name: string; last_name: string } | null
  classes: { class_type_id: string; class_types: { label: string } | null } | null
  event_students: { count: number }[]
  instructor_class_unavailability: {
    id: string; status: string; notification_status: string; created_at: string
    notification_http_status: number | null; notification_failure_reason: string | null
    instructors: { first_name: string; last_name: string } | null
  } | null
}

const sgDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' })
const sgTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export const singaporeDate = (date: Date) => sgDate.format(date)
const time = (date: Date) => sgTime.format(date)

function sessionType(classType: string): SessionType {
  if (/weapon/i.test(classType)) return 'weapons'
  if (/kid|child/i.test(classType)) return 'kids'
  return 'regular'
}

export async function loadCalendarCentres(signal?: AbortSignal): Promise<Centre[]> {
  const rows: CentreRow[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('centres')
      .select('id,name,short_name,address,timezone,status').order('name').range(from, from + 499).abortSignal(signal ?? new AbortController().signal)
    if (error) throw error
    rows.push(...((data ?? []) as CentreRow[]))
    if (!data || data.length < 500) break
  }
  return rows.map(row => ({ id: row.id, name: row.name, shortName: row.short_name, address: row.address, timezone: row.timezone, status: row.status }))
}

/** Classes in the visible range for one dojo, or every dojo when `centreId` is null. */
export async function loadCalendarClasses(centres: Centre[], centreId: string | null, firstDay: string, afterLastDay: string, signal?: AbortSignal): Promise<AdminCalendarEvent[]> {
  const centreNames = new Map(centres.map(centre => [centre.id, centre.name]))
  const rows: EventRow[] = []
  // Bound each request to the visible date range (and dojo, when chosen). Paginate
  // rather than relying on PostgREST's default 1,000-row response limit.
  for (let from = 0; ; from += 500) {
    let query = supabase.from('events')
      .select('id,centre_id,instructor_id,name,starts_at,ends_at,status,instructors(first_name,last_name),classes(class_type_id,class_types(label)),event_students(count),instructor_class_unavailability(id,status,notification_status,notification_http_status,notification_failure_reason,created_at,instructors(first_name,last_name))')
      .eq('event_type', 'class')
      .gt('ends_at', `${firstDay}T00:00:00+08:00`).lt('starts_at', `${afterLastDay}T00:00:00+08:00`)
      .order('starts_at').order('id').range(from, from + 499).abortSignal(signal ?? new AbortController().signal)
    if (centreId) query = query.eq('centre_id', centreId)
    const { data, error } = await query
    if (error) throw error
    rows.push(...((data ?? []) as unknown as EventRow[]))
    if (!data || data.length < 500) break
  }
  return rows.flatMap(row => {
    const startsAt = new Date(row.starts_at)
    const endsAt = new Date(row.ends_at)
    const classType = row.classes?.class_types?.label ?? row.classes?.class_type_id ?? 'Class'
    const instructor = row.instructors
    const instructorName = instructor ? `${instructor.first_name} ${instructor.last_name}`.trim() : 'Unassigned'
    const segments: AdminCalendarEvent[] = []
    // A class crossing midnight belongs on both Singapore calendar days.
    for (let day = singaporeDate(startsAt) < firstDay ? firstDay : singaporeDate(startsAt);
      day < afterLastDay && new Date(`${day}T00:00:00+08:00`) < endsAt;
      day = singaporeDate(new Date(new Date(`${day}T00:00:00+08:00`).getTime() + 86_400_000))) {
      const [year, month, date] = day.split('-').map(Number)
      const nextDay = new Date(`${day}T00:00:00+08:00`).getTime() + 86_400_000
      const startTime = singaporeDate(startsAt) === day ? time(startsAt) : '00:00'
      const endTime = endsAt.getTime() >= nextDay ? '23:59' : time(endsAt)
      segments.push({
        id: `${row.id}:${day}`,
        session: {
          id: row.id, centreId: row.centre_id, instructorId: row.instructor_id ?? '', title: row.name,
          date: day, startTime, durationMinutes: Math.round((endsAt.getTime() - startsAt.getTime()) / 60000),
          type: sessionType(classType), isExternal: false,
        },
        date: new Date(year, month - 1, date), startTime, endTime,
        name: row.name, centreName: centreNames.get(row.centre_id) ?? 'Unknown dojo', instructorName, roster: [],
        rosterCount: row.event_students?.[0]?.count ?? 0,
        liveDetails: { eventId: row.id, status: row.status, classType, startsAt: row.starts_at, endsAt: row.ends_at,
          unavailability: row.instructor_class_unavailability ? {
            id: row.instructor_class_unavailability.id, status: row.instructor_class_unavailability.status,
            notification_status: row.instructor_class_unavailability.notification_status,
            notification_http_status: row.instructor_class_unavailability.notification_http_status,
            notification_failure_reason: row.instructor_class_unavailability.notification_failure_reason,
            created_at: row.instructor_class_unavailability.created_at,
            reportedBy: [row.instructor_class_unavailability.instructors?.first_name,
              row.instructor_class_unavailability.instructors?.last_name].filter(Boolean).join(' ') || 'Assigned instructor',
          } : null },
      })
    }
    return segments
  })
}

export interface ClassRosterEntry {
  studentId: string
  name: string
  grade: GradeRow | null
  attendance: AttendanceState
}

/** A class's students and their recorded attendance, decoded like the instructor roster. */
export async function loadClassRoster(eventId: string, startsAt: string, signal?: AbortSignal): Promise<ClassRosterEntry[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('event_students')
      .select('*, student:students(*, grade:grades(*), centre:centres(*))')
      .eq('event_id', eventId).order('student_id').range(from, from + 499)
      .abortSignal(signal ?? new AbortController().signal)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  return rows.map(decodeRosterEntry).map(({ record, student }) => ({
    studentId: student.student.id,
    name: [student.student.first_name, student.student.last_name].filter(Boolean).join(' ') || student.student.email,
    grade: student.grade,
    attendance: rosterAttendance(record, startsAt),
  }))
}
