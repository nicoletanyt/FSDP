import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const uuidNamespace = Buffer.from('6ba7b8119dad11d180b400c04fd430c8', 'hex')
const dayMilliseconds = 86_400_000
const tracks = ['adult', 'children', 'adult']

export function singaporeDate(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a date in YYYY-MM-DD format.')
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Use a valid calendar date.')
  return date
}

const singaporeTime = value => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const addDays = (value, days) => new Date(dateOnly(value).getTime() + days * dayMilliseconds).toISOString().slice(0, 10)

// Three future dates in this Monday–Sunday week or the next: this Saturday,
// then next week's Wednesday, Saturday and Sunday, skipping any already past.
export function gradingSessionDates(today = singaporeDate()) {
  const monday = addDays(today, -((dateOnly(today).getUTCDay() + 6) % 7))
  const candidates = [addDays(monday, 5), addDays(monday, 9), addDays(monday, 12), addDays(monday, 13)]
  return { weekStart: monday, weekEndExclusive: addDays(monday, 14), dates: candidates.filter(date => date > today).slice(0, 3) }
}

// Name-based UUID v5, so rerunning for the same date and track reuses the ID.
export function gradingSessionId(date, track) {
  const bytes = createHash('sha1').update(uuidNamespace).update(`fsdp/grading-session/v1/${date}/${track}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const showDate = date => new Date(`${date}T00:00:00+08:00`)
  .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Singapore' })

export function buildGradingSessionPlan({ today, centreId, examiners, gradeTracks }) {
  if (!centreId) throw new Error('An active centre is required.')
  if (!examiners.length) throw new Error('No instructors are marked as examiners, so nobody could grade the new sessions. Mark examiners first.')
  const { dates, weekStart, weekEndExclusive } = gradingSessionDates(today)
  if (dates.length < 3) throw new Error('Fewer than three future dates remain in this week and next week.')
  const sessions = dates.map((date, index) => {
    const track = tracks[index]
    const id = gradingSessionId(date, track)
    const weekend = [0, 6].includes(dateOnly(date).getUTCDay())
    const [start, end] = weekend ? ['10:00', '13:00'] : ['19:00', '21:30']
    const chief = examiners[index % examiners.length]
    return {
      event: { id, event_type: 'grading', centre_id: centreId, instructor_id: chief.id, status: 'scheduled',
        name: `${track === 'adult' ? 'Adult' : "Children's"} grading — ${showDate(date)}`,
        starts_at: `${date}T${start}:00+08:00`, ends_at: `${date}T${end}:00+08:00` },
      grading: { event_id: id, track, official_schedule: true, grading_date: date, application_status: 'open',
        application_opens_on: addDays(today, -14), application_deadline: addDays(date, -1),
        reporting_release_on: addDays(date, -2), reporting_time: `${start}:00` },
      targets: gradeTracks.filter(row => row.track === track).map(row => ({ grading_event_id: id, grade_id: row.grade_id })),
      panel: examiners.map(examiner => ({ grading_event_id: id, instructor_id: examiner.id, is_chief: examiner.id === chief.id })),
    }
  })
  return { weekStart, weekEndExclusive, sessions }
}

// Same age split as eligible_grading_students(): 13 or older in the grading
// year is adult, younger is children.
export function trackForStudent(dateOfBirth, gradingDate) {
  return Number(gradingDate.slice(0, 4)) - Number(dateOfBirth.slice(0, 4)) >= 13 ? 'adult' : 'children'
}

// The next grade on the student's track, by sort order.
export function nextGrade(currentGradeId, track, grades, gradeTracks) {
  const order = new Map(grades.map(grade => [grade.id, grade.sort_order]))
  const current = order.get(currentGradeId)
  if (current === undefined) return null
  return gradeTracks.filter(row => row.track === track && (order.get(row.grade_id) ?? -1) > current)
    .sort((left, right) => order.get(left.grade_id) - order.get(right.grade_id))[0]?.grade_id ?? null
}

// Candidates for each session: active students on the session's track whose
// next grade is a target. Each student sits at most one session, at most
// perGrade per grade per session, and grades are filled in turn so each
// session spans several grades.
export function buildCandidatePlan({ sessions, students, grades, gradeTracks, perSession = 12, perGrade = 3, maxGrades = 4 }) {
  const used = new Set()
  const roster = []
  const applications = []
  for (const { grading, targets } of sessions) {
    const targetIds = new Set(targets.map(row => row.grade_id))
    const byGrade = new Map()
    for (const student of [...students].sort((left, right) => String(left.member_no).localeCompare(String(right.member_no)))) {
      if (used.has(student.id) || !student.date_of_birth || trackForStudent(student.date_of_birth, grading.grading_date) !== grading.track) continue
      const target = nextGrade(student.current_grade_id, grading.track, grades, gradeTracks)
      if (!target || !targetIds.has(target)) continue
      if (!byGrade.has(target)) byGrade.set(target, [])
      byGrade.get(target).push(student)
    }
    const order = gradeId => grades.find(grade => grade.id === gradeId).sort_order
    // Keep each grading day to maxGrades sessions (each gets its own time slot),
    // preferring the grades with the most eligible students.
    const chosen = [...byGrade.entries()]
      .sort(([left, a], [right, b]) => b.length - a.length || order(left) - order(right)).slice(0, maxGrades)
    const queues = chosen.sort(([left], [right]) => order(left) - order(right))
      .map(([gradeId, list]) => ({ gradeId, list: list.slice(0, perGrade) }))
    let picked = 0
    while (picked < perSession && queues.some(queue => queue.list.length)) {
      for (const queue of queues) {
        const student = queue.list.shift()
        if (!student || picked >= perSession) continue
        used.add(student.id)
        picked += 1
        roster.push({ event_id: grading.event_id, student_id: student.id })
        applications.push({ student_id: student.id, grading_event_id: grading.event_id, target_grade_id: queue.gradeId, status: 'submitted' })
      }
    }
  }
  return { roster, applications }
}

// Give each grade with candidates its own back-to-back slot, in grade order,
// starting at the session start; the event then spans exactly those slots.
// Grades without candidates stay unscheduled.
export function scheduleGradeSessions(sessions, applications, grades, slotMinutes = 30) {
  const order = new Map(grades.map(grade => [grade.id, grade.sort_order]))
  return sessions.map(session => {
    const graded = new Set(applications.filter(row => row.grading_event_id === session.event.id).map(row => row.target_grade_id))
    const timed = session.targets.filter(row => graded.has(row.grade_id))
      .sort((left, right) => order.get(left.grade_id) - order.get(right.grade_id))
    if (!timed.length) return session
    const start = Date.parse(session.event.starts_at)
    const slot = index => new Date(start + index * slotMinutes * 60_000).toISOString()
    const times = new Map(timed.map((row, index) => [row.grade_id, { starts_at: slot(index), ends_at: slot(index + 1) }]))
    return {
      ...session,
      event: { ...session.event, ends_at: slot(timed.length) },
      targets: session.targets.map(row => ({ ...row, starts_at: null, ends_at: null, ...times.get(row.grade_id) })),
    }
  })
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Set ${name} in the root .env.`)
  return value
}

function checked(result, operation) {
  if (result.error) throw new Error(`${operation} failed${result.error.code ? ` (${result.error.code})` : ''}.`)
  return result.data
}

const count = async (query, operation) => checked(await query, operation)?.length ?? 0

export async function seedGradingSessions({ today = singaporeDate(), yes = false }) {
  const project = new URL(requiredEnv('VITE_SUPABASE_URL')).origin
  const db = createClient(project, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const [eventResult, centreResult, examinerResult, trackResult, gradeResult, studentResult] = await Promise.all([
    db.from('events').select('id').eq('event_type', 'grading'),
    db.from('centres').select('id,name').eq('status', 'active').order('name'),
    db.from('instructors').select('id,first_name,last_name,user_id,users(role)').eq('is_examiner', true).order('first_name').order('last_name'),
    db.from('grade_tracks').select('grade_id,track'),
    db.from('grades').select('id,sort_order'),
    db.from('students').select('id,member_no,date_of_birth,current_grade_id').eq('membership_status', 'active'),
  ])
  const existing = checked(eventResult, 'Grading lookup').map(row => row.id)
  const centres = checked(centreResult, 'Centre lookup')
  const centre = centres.find(row => /headquarters/i.test(row.name)) ?? centres[0]
  // Only examiners who can sign in as instructors can grade, so only they sit on panels.
  const flagged = checked(examinerResult, 'Examiner lookup')
  const canSignIn = row => row.user_id && [row.users].flat()[0]?.role === 'instructor'
  const examiners = flagged.filter(canSignIn)
  const skippedExaminers = flagged.filter(row => !canSignIn(row)).map(row => `${row.first_name} ${row.last_name}`.trim())
  const gradeTracks = checked(trackResult, 'Grade-track lookup')
  const plan = buildGradingSessionPlan({ today, centreId: centre?.id, examiners, gradeTracks })
  const grades = checked(gradeResult, 'Grade lookup')
  const candidates = buildCandidatePlan({ sessions: plan.sessions, gradeTracks, grades, students: checked(studentResult, 'Student lookup') })
  const sessions = scheduleGradeSessions(plan.sessions, candidates.applications, grades)

  const batchIds = existing.length
    ? checked(await db.from('grading_batches').select('id').in('event_id', existing), 'Batch lookup').map(row => row.id) : []
  const affected = existing.length ? Object.fromEntries(await Promise.all([
    ['applications', db.from('grading_applications').select('id').in('grading_event_id', existing)],
    ['checkoutAttempts', db.from('grading_checkout_attempts').select('id').in('grading_event_id', existing)],
    ['participants', db.from('event_students').select('student_id').in('event_id', existing)],
    ['reviews', db.from('instructor_grading_reviews').select('request_id').in('event_id', existing)],
  ].map(async ([key, query]) => [key, await count(query, `${key} lookup`)]))) : {}
  const summary = {
    project, today, centre: centre.name,
    examiners: examiners.map(row => `${row.first_name} ${row.last_name}`.trim()),
    ...(skippedExaminers.length ? { skippedExaminersWithoutLogin: skippedExaminers } : {}),
    willDelete: { gradingSessions: existing.length, gradingBatches: batchIds.length, ...affected },
    willCreate: sessions.map(({ event, grading, targets, panel }) => ({
      name: event.name, date: grading.grading_date, track: grading.track, startsAt: event.starts_at, endsAt: event.ends_at,
      gradeSessions: targets.filter(row => row.starts_at).map(row => `${row.grade_id} ${singaporeTime(row.starts_at)}–${singaporeTime(row.ends_at)}`),
      targetGrades: targets.length, panel: panel.length,
      candidates: Object.fromEntries(Object.entries(Object.groupBy(
        candidates.applications.filter(row => row.grading_event_id === event.id), row => row.target_grade_id))
        .map(([grade, rows]) => [grade, rows.length])),
      chief: (({ first_name, last_name } = {}) => `${first_name} ${last_name}`.trim())(examiners.find(row => row.id === event.instructor_id)) })),
  }
  if (!yes) return { ...summary, dryRun: true, next: 'Rerun with --yes to delete and recreate.' }

  // Delete leaf rows first. Each step is its own request, so a failure leaves
  // fewer rows rather than broken references; rerunning finishes the job.
  if (batchIds.length) {
    for (const table of ['grading_batch_results', 'grading_batch_items', 'grading_batch_write_requests', 'grading_batch_students']) {
      checked(await db.from(table).delete().in('batch_id', batchIds), `${table} cleanup`)
    }
    checked(await db.from('grading_batches').delete().in('id', batchIds), 'Batch cleanup')
  }
  if (existing.length) {
    checked(await db.from('instructor_grading_reviews').delete().in('event_id', existing), 'Review cleanup')
    checked(await db.from('grading_checkout_attempts').delete().in('grading_event_id', existing), 'Checkout-attempt cleanup')
    // Cascades to gradings, target grades, rosters, applications, sign-offs and panels.
    checked(await db.from('events').delete().in('id', existing).eq('event_type', 'grading'), 'Grading cleanup')
  }

  checked(await db.from('events').insert(sessions.map(row => row.event)), 'Event insertion')
  checked(await db.from('gradings').insert(sessions.map(row => row.grading)), 'Grading insertion')
  checked(await db.from('grading_target_grades').insert(sessions.flatMap(row => row.targets)), 'Target-grade insertion')
  checked(await db.from('grading_panel_members').insert(sessions.flatMap(row => row.panel)), 'Panel insertion')
  if (candidates.roster.length) {
    checked(await db.from('event_students').insert(candidates.roster), 'Roster insertion')
    checked(await db.from('grading_applications').insert(candidates.applications), 'Application insertion')
  }

  const ids = sessions.map(row => row.event.id)
  const saved = checked(await db.from('gradings').select('event_id,grading_date,track,events!inner(name),grading_target_grades(count),grading_panel_members(count),grading_applications(count)')
    .in('event_id', ids).order('grading_date'), 'Verification')
  const remaining = checked(await db.from('events').select('id').eq('event_type', 'grading'), 'Remaining-grading lookup')
  if (saved.length !== 3 || remaining.length !== 3) throw new Error('Grading session verification failed.')
  return { ...summary, dryRun: false, deleted: summary.willDelete,
    created: saved.map(row => ({ id: row.event_id, name: row.events.name, date: row.grading_date, track: row.track,
      targetGrades: row.grading_target_grades[0].count, panel: row.grading_panel_members[0].count,
      candidates: row.grading_applications[0].count })) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { today: { type: 'string' }, yes: { type: 'boolean', default: false } } })
    console.log(JSON.stringify(await seedGradingSessions({ today: values.today ?? singaporeDate(), yes: values.yes }), null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Grading session seed failed.')
    process.exitCode = 1
  }
}
