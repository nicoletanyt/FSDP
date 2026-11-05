import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { adapters, api, decoders, errors } from './helpers/instructor-modules.mjs'

const { InstructorDataError, toInstructorDataError } = errors
const {
  parseEntityId, parseInstructorRow, resolveInstructorIdentity,
  toGradeSummary, toStudentSummary, toAttendanceState,
  attendanceFromArrival, toSingaporeDateTime,
} = adapters
const { createInstructorApi, requestInstructorData } = api
const { decodeHistoryEntry, decodeSummary } = decoders

const userId = '00000000-0000-4000-8000-000000000001'
const instructorId = '00000000-0000-4000-8000-000000000002'
const otherUserId = '00000000-0000-4000-8000-000000000003'
const centreId = '00000000-0000-4000-8000-000000000004'
const studentId = '00000000-0000-4000-8000-000000000005'
const instructor = {
  id: instructorId, user_id: userId,
  first_name: '  Test ', last_name: ' Instructor  ', email: 'teacher@example.test',
  created_at: '2026-11-04T00:00:00+00:00', updated_at: '2026-11-04T00:00:00+00:00',
}

function fixtureClient({
  user = { id: userId }, authError = null,
  profile = { id: userId, role: 'instructor' }, profileError = null,
  record = instructor, recordError = null,
} = {}) {
  const reads = []
  return {
    reads,
    auth: { getUser: async () => ({ data: { user }, error: authError }) },
    from(table) {
      const read = { table, filters: [] }
      reads.push(read)
      return {
        select() { return this },
        eq(column, value) { read.filters.push([column, value]); return this },
        async maybeSingle() {
          if (table === 'users') return { data: profile, error: profileError }
          if (table === 'instructors') return { data: record, error: recordError }
          assert.fail(`Unexpected table: ${table}`)
        },
      }
    },
  }
}

test('current instructor resolves the domain ID, never the auth ID or a matching name/email', async () => {
  const client = fixtureClient()
  const identity = await createInstructorApi(client).getCurrentInstructor()
  assert.deepEqual(identity, {
    userId, instructorId, name: 'Test Instructor', email: instructor.email,
  })
  assert.notEqual(identity.userId, identity.instructorId)
  assert.deepEqual(client.reads, [
    { table: 'users', filters: [['id', userId]] },
    { table: 'instructors', filters: [['user_id', userId]] },
  ])
})

test('unauthenticated and non-instructor accounts never request instructor records', async () => {
  for (const options of [
    { user: null },
    { user: null, authError: { name: 'AuthSessionMissingError', status: 400 } },
    { profile: null },
    { profile: { id: userId, role: 'student' } },
    { profile: { id: userId, role: 'administrator' } },
    { profile: { id: otherUserId, role: 'instructor' } },
  ]) {
    const client = fixtureClient(options)
    await assert.rejects(createInstructorApi(client).getCurrentInstructor(), error => {
      assert.ok(error instanceof InstructorDataError)
      assert.equal(error.code, options.user === null ? 'unauthenticated' : 'forbidden')
      return true
    })
    assert.ok(client.reads.every(read => read.table !== 'instructors'))
  }
})

test('missing, unlinked and mismatched instructor records never borrow another identity', async () => {
  for (const [record, code] of [
    [null, 'instructor_not_found'],
    [{ ...instructor, user_id: null }, 'forbidden'],
    [{ ...instructor, user_id: otherUserId }, 'forbidden'],
    [{ ...instructor, id: 'instructor-1' }, 'invalid_data'],
    [{ ...instructor, created_at: 'not a timestamp' }, 'invalid_data'],
  ]) {
    await assert.rejects(createInstructorApi(fixtureClient({ record })).getCurrentInstructor(),
      error => error instanceof InstructorDataError && error.code === code)
  }
  assert.equal(parseInstructorRow({ ...instructor, user_id: null }).user_id, null)
  const row = parseInstructorRow({ ...instructor, first_name: '', last_name: '' })
  assert.equal(resolveInstructorIdentity(parseEntityId(userId, 'auth-user'), row).name, instructor.email)
})

test('ID parsing accepts database UUIDs and rejects fixture IDs and invalid values', () => {
  const uuid = 'ABCDEF12-3456-4789-ABCD-EF1234567890'
  assert.equal(parseEntityId(uuid, 'instructor'), uuid.toLowerCase())
  for (const value of [null, undefined, 42, '', 'student-1', 'availability-demo-1', `${userId} `]) {
    assert.throws(() => parseEntityId(value, 'student'), { code: 'invalid_data' })
  }
})

test('database failures and rejected transports remain errors, not empty successful results', async () => {
  const secretDetail = 'internal database detail that must not reach the UI'
  const message = 'Unable to load instructor data.'
  for (const operation of [
    async () => ({ data: null, error: { message: secretDetail } }),
    async () => { throw new Error(secretDetail) },
  ]) {
    await assert.rejects(requestInstructorData(operation, message), error => {
      assert.equal(error.code, 'request_failed')
      assert.equal(error.message, message)
      assert.ok(!error.message.includes(secretDetail))
      return true
    })
  }
  assert.equal(await requestInstructorData(async () => ({ data: null, error: null }), message), null)
  assert.deepEqual(await requestInstructorData(async () => ({ data: [], error: null }), message), [])
  await assert.rejects(createInstructorApi(fixtureClient({ recordError: { code: '42501' } })).getCurrentInstructor(),
    { code: 'forbidden' })
  await assert.rejects(createInstructorApi(fixtureClient({ profileError: { code: 'PGRST301' } })).getCurrentInstructor(),
    { code: 'unauthenticated' })
  const original = new InstructorDataError('invalid_data', 'Invalid data.')
  assert.equal(toInstructorDataError(original, message), original)
})

test('grade and student projections retain database labels, unranked, nullable contact and unknown references', () => {
  const grade = { id: 'unranked', label: 'Unranked', colour: null, is_ranked: false, sort_order: 0 }
  assert.deepEqual(toGradeSummary(grade), {
    id: 'unranked', label: 'Unranked', colour: null, isRanked: false, sortOrder: 0,
  })
  const customGrade = { ...grade, id: 'database-owned-id', label: 'Published custom label', is_ranked: true }
  assert.equal(toGradeSummary(customGrade).label, customGrade.label)
  assert.equal(toGradeSummary(null), null)
  const student = {
    id: studentId, member_no: 'ASK-00042', first_name: 'Test', last_name: 'Student',
    email: 'student@example.test', phone: null, home_centre_id: centreId,
    current_grade_id: 'unranked', membership_status: 'pending',
  }
  const centre = { id: centreId, name: 'Supabase centre', capacity: null }
  const summary = toStudentSummary(student, grade, centre)
  assert.equal(summary.phone, null)
  assert.equal(summary.memberNo, student.member_no)
  assert.equal(summary.homeCentre.capacity, null)
  assert.equal(summary.membershipStatus, 'pending')
  const missing = toStudentSummary(student, null, null)
  assert.equal(missing.grade, null)
  assert.equal(missing.homeCentre, null)
  assert.throws(() => toStudentSummary(student, customGrade, centre), { code: 'invalid_data' })
  assert.throws(() => toStudentSummary(student, grade, { ...centre, id: otherUserId }), { code: 'invalid_data' })
})

test('all schema attendance states survive projection; only null is unmarked', () => {
  for (const status of ['present', 'late', 'absent', 'excused']) assert.equal(toAttendanceState(status), status)
  assert.equal(toAttendanceState(null), 'unmarked')
  assert.throws(() => toAttendanceState('unmarked'), { code: 'invalid_data' })
  assert.throws(() => toAttendanceState('unknown'), { code: 'invalid_data' })
})

test('arrival classification includes exactly five minutes of grace and preserves unknown arrival', () => {
  const startsAt = '2026-11-04T19:00:00+08:00'
  for (const arrivedAt of ['2026-11-04T18:59:00+08:00', '2026-11-04T11:00:00Z', '2026-11-04T19:05:00+08:00']) {
    assert.equal(attendanceFromArrival(startsAt, arrivedAt), 'present')
  }
  assert.equal(attendanceFromArrival(startsAt, '2026-11-04T11:05:00.001Z'), 'late')
  assert.equal(attendanceFromArrival(startsAt, null), null)
  // Crossing Singapore midnight does not reset the grace period.
  assert.equal(attendanceFromArrival('2026-11-04T23:58:00+08:00', '2026-11-05T00:03:00+08:00'), 'present')
  assert.equal(attendanceFromArrival('2026-11-04T23:58:00+08:00', '2026-11-05T00:03:01+08:00'), 'late')
})

test('calendar projections always use Singapore, including midnight and year boundaries', () => {
  assert.deepEqual(toSingaporeDateTime('2026-11-04T16:00:00Z'), { date: '2026-11-05', time: '00:00' })
  assert.deepEqual(toSingaporeDateTime('2026-12-31T16:30:00Z'), { date: '2027-01-01', time: '00:30' })
  assert.deepEqual(toSingaporeDateTime('2026-11-04T19:00:00+08:00'), { date: '2026-11-04', time: '19:00' })
  for (const value of ['2026-11-04', '2026-11-04T19:00:00', '2026-02-30T00:00:00Z', '2026-11-04T24:00:00Z', 'invalid']) {
    assert.throws(() => toSingaporeDateTime(value), { code: 'invalid_data' })
    assert.throws(() => attendanceFromArrival('2026-11-04T11:00:00Z', value), { code: 'invalid_data' })
  }
})

// Exercise real Supabase/PostgREST serialization, not an imitation query builder.
function httpClient(handler, { instructorRecord = instructor } = {}) {
  const requests = []
  const client = createClient('https://instructor-tests.supabase.co', 'offline-publishable-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      const url = new URL(request.url)
      if (url.pathname === '/rest/v1/users') return Response.json({ id: userId, role: 'instructor' })
      if (url.pathname === '/rest/v1/instructors') return Response.json(instructorRecord)
      return handler(request, url)
    } },
  })
  client.auth.getUser = async () => ({ data: { user: { id: userId } }, error: null })
  return { api: createInstructorApi(client), requests }
}

const eventId = '00000000-0000-4000-8000-000000000006'
const metadata = { created_at: instructor.created_at, updated_at: instructor.updated_at }
const centre = { id: centreId, name: 'Live dojo', short_name: 'live', address: '', timezone: 'Asia/Singapore', status: 'active', capacity: null, ...metadata }
const grade = { id: 'unranked', label: 'Unranked', colour: null, is_ranked: false, sort_order: 0 }
const student = {
  id: studentId, user_id: null, member_no: 'LIVE-1', first_name: 'Live', last_name: 'Student',
  email: 'live@example.test', phone: null, home_centre_id: centreId, date_of_birth: '2000-01-01',
  current_grade_id: 'unranked', membership_status: 'active', joined_at: '2020-01-01', last_graded_at: null,
  follow_up_status: 'none', outstanding_fees: false, ...metadata, grade, centre,
}
const event = {
  id: eventId, event_type: 'class', centre_id: centreId, instructor_id: instructorId,
  name: 'Live class', starts_at: '2026-11-04T11:00:00Z', ends_at: '2026-11-04T12:00:00Z', status: 'scheduled', ...metadata,
}
const calendarEntry = { ...event, centre, class: null, grading: null, seminar: null, workshop: null, participants: [{ count: 0 }] }
const record = {
  event_id: eventId, student_id: studentId, attendance_status: null, recorded_at: null,
  report: null, report_author_id: null, assessment_status: null, assessment_notes: null, checked_in_at: null,
}
const page = (items, total = items.length, offset = 0, limit = 50) => ({ items, total, offset, limit })
const responsePage = (items, total = items.length) => Response.json(items, { headers: { 'content-range': `0-${Math.max(0, items.length - 1)}/${total}` } })

test('directory uses RPC parameters for literal search, facets and independent page totals', async () => {
  const { api } = httpClient(async (request, url) => {
    assert.equal(url.pathname, '/rest/v1/rpc/instructor_student_directory')
    assert.deepEqual(await request.json(), {
      search_text: 'Alex%,_.()', filter_grade: 'unranked', filter_colour: null, filter_centre: centreId, page_size: 1, page_offset: 4,
    })
    return Response.json({ ...page([student], 10, 4, 1), scopeTotal: 30, facets: { grades: [grade], colours: [], centres: [centre] } })
  })
  const result = await api.getStudents({ search: 'Alex%,_.()', gradeId: 'unranked', centreId, limit: 1, offset: 4 })
  assert.equal(result.total, 10)
  assert.equal(result.scopeTotal, 30)
  assert.equal(result.items[0].student.phone, null)
  assert.equal(result.facets.grades[0].is_ranked, false)
})

test('reference data follows every server-capped page instead of silently truncating syllabus rows', async () => {
  const syllabus = Array.from({ length: 205 }, (_, index) => ({
    id: `database/item/${index}`, grade_id: 'unranked', track: 'adult', category: 'Basics', sort_order: index, label: `Technique ${index}`, note: null,
  }))
  const offsets = []
  const { api } = httpClient(async (_request, url) => {
    const table = url.pathname.split('/').at(-1)
    const source = { centres: [centre], grades: [grade], grade_tracks: [{ grade_id: 'unranked', track: 'adult' }],
      grade_requirements: [{ grade_id: 'unranked', track: 'adult', min_months: 3, max_months: null, min_sessions: 20, min_age_years: null }],
      class_types: [], syllabus_items: syllabus }[table]
    assert.ok(source, `Unexpected table ${table}`)
    const offset = Number(url.searchParams.get('offset'))
    if (table === 'syllabus_items') offsets.push(offset)
    return responsePage(source.slice(offset, offset + 40), source.length)
  })
  const result = await api.getReferenceData()
  assert.equal(result.syllabusItems.length, 205)
  assert.deepEqual(offsets, [0, 40, 80, 120, 160, 200])
  assert.equal(result.syllabusItems[204].id, 'database/item/204')
})

test('calendar and availability queries are instructor-scoped, bounded and deterministically ordered', async () => {
  const { api } = httpClient(async (_request, url) => {
    assert.equal(url.searchParams.get('instructor_id'), `eq.${instructorId}`)
    if (url.pathname === '/rest/v1/events') {
      assert.equal(url.searchParams.get('starts_at'), 'lt.2026-11-06T00:00:00+08:00')
      assert.equal(url.searchParams.get('ends_at'), 'gt.2026-11-04T00:00:00+08:00')
      assert.equal(url.searchParams.get('order'), 'starts_at.asc,id.asc')
      return responsePage([calendarEntry])
    }
    assert.equal(url.pathname, '/rest/v1/instructor_availability')
    assert.deepEqual(url.searchParams.getAll('date'), ['gte.2026-11-04', 'lt.2026-11-06'])
    return responsePage([])
  })
  const result = await api.getCalendar({ from: '2026-11-04T00:00:00+08:00', to: '2026-11-06T00:00:00+08:00' })
  assert.equal(result.items[0].event.id, eventId)
  assert.equal(result.items[0].rosterCount, 0)
  assert.equal(result.items[0].classType, null)
  assert.equal((await api.getAvailability({ from: '2026-11-04', to: '2026-11-06' })).total, 0)
})

test('detail reads select primary contacts and active alerts without manufacturing missing records', async () => {
  const { api } = httpClient(async () => Response.json({ ...student, emergency_contacts: [
    { id: otherUserId, student_id: studentId, name: 'Secondary', relationship: 'Sibling', phone: '111', is_primary: false },
    { id: userId, student_id: studentId, name: 'Primary', relationship: 'Parent', phone: '222', is_primary: true },
  ], medical_alerts: [
    { id: userId, student_id: studentId, description: 'Historical alert', active: false, recorded_at: metadata.created_at },
    { id: otherUserId, student_id: studentId, description: 'Active alert', active: true, recorded_at: metadata.created_at },
  ] }))
  const result = await api.getStudentDetail(studentId)
  assert.equal(result.emergencyContacts[0].name, 'Primary')
  assert.equal(result.medicalAlerts.length, 1)
  assert.equal(result.student.phone, null)
  assert.equal(await httpClient(async () => Response.json(null)).api.getStudentDetail(studentId), null)
})

test('history distinguishes recorded pending assessments from unrecorded rows and retains unknown target grades', async () => {
  const entry = { record: { ...record, assessment_status: 'pending' }, event: { ...event, event_type: 'grading' },
    centre, instructor, reportAuthor: null, targetGrade: null }
  const { api } = httpClient(async (request, url) => {
    assert.equal(url.pathname, '/rest/v1/rpc/instructor_student_history')
    const parameters = await request.json()
    assert.equal(parameters.target_student, studentId)
    assert.equal(parameters.filter_type, 'grading')
    assert.equal(parameters.recorded_assessments_only, true)
    return Response.json(page([entry]))
  })
  const result = await api.getRecordedAssessments(studentId)
  assert.equal(result.items[0].record.assessment_status, 'pending')
  assert.equal(result.items[0].targetGrade, null)
  const invalid = httpClient(async () => Response.json(page([{ ...entry, record }])))
  await assert.rejects(invalid.api.getRecordedAssessments(studentId), { code: 'invalid_data' })
})

test('assessments use event/student keys and leave a missing application target unknown', async () => {
  const { api } = httpClient(async (_request, url) => {
    if (url.pathname === '/rest/v1/events') return Response.json({ ...calendarEntry, event_type: 'grading',
      grading: { event_id: eventId, track: null, application_deadline: null, application_status: 'closed', target_grades: [] } })
    if (url.pathname === '/rest/v1/event_students') return Response.json({ ...record, student })
    assert.equal(url.pathname, '/rest/v1/grading_applications')
    assert.equal(url.searchParams.get('grading_event_id'), `eq.${eventId}`)
    assert.equal(url.searchParams.get('student_id'), `eq.${studentId}`)
    return Response.json(null)
  })
  const result = await api.getAssessment({ eventId, studentId })
  assert.equal(result.record.assessment_status, null)
  assert.equal(result.application, null)
  assert.equal(result.session.grading.track, null)
})

test('rosters, reports, sign-offs and zero attendance summaries keep their real nullable values', async () => {
  const { api } = httpClient(async (_request, url) => {
    switch (url.pathname) {
      case '/rest/v1/events': return Response.json(calendarEntry)
      case '/rest/v1/event_students': return responsePage([{ ...record, attendance_status: 'excused', student }])
      case '/rest/v1/technique_sign_offs': return responsePage([{
        id: userId, student_id: studentId, syllabus_item_id: 'database/item', signed_off_at: metadata.created_at,
        signed_off_by: null, note: null, instructor: null,
      }])
      case '/rest/v1/rpc/instructor_event_reports': return Response.json(page([{ record, student, previousReports: [] }]))
      case '/rest/v1/rpc/instructor_student_summary': return Response.json({
        pastSessions: 0, present: 0, late: 0, absent: 0, excused: 0, unmarked: 0,
        cycleStart: '2020-01-01', cycleAttended: 0, consecutiveAbsences: 0,
        periodStart: null, periodEnd: null, lastAttended: null,
      })
      default: assert.fail(`Unexpected read ${url.pathname}`)
    }
  })
  assert.equal((await api.getRoster(eventId)).items[0].record.attendance_status, 'excused')
  assert.deepEqual((await api.getSessionReports(eventId)).items[0].previousReports, [])
  assert.equal((await api.getTechniqueSignOffs(studentId))[0].instructor, null)
  assert.equal((await api.getStudentSummary(studentId)).lastAttended, null)
})

test('invalid filters, failed requests, absent counts and wrong joined identities fail explicitly', async () => {
  const setup = httpClient(async () => assert.fail('Invalid input must not reach HTTP'))
  for (const options of [{ limit: 0 }, { limit: 101 }, { offset: -1 }, { offset: 1.5 }, { search: 'x'.repeat(201) }]) {
    await assert.rejects(setup.api.getStudents(options), { code: 'invalid_request' })
  }
  await assert.rejects(setup.api.getCalendar({ from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z' }), { code: 'invalid_request' })
  assert.equal(setup.requests.length, 0)
  const failure = httpClient(async () => Response.json({ message: 'private SQL detail', code: '42501' }, { status: 403 }))
  await assert.rejects(failure.api.getStudents(), error => error.code === 'forbidden' && !error.message.includes('private SQL detail'))
  const missingCount = httpClient(async () => Response.json([]))
  await assert.rejects(missingCount.api.getCalendar({ from: '2026-11-04T00:00:00Z', to: '2026-11-05T00:00:00Z' }), { code: 'invalid_data' })
  const wrong = httpClient(async () => Response.json({ ...calendarEntry, instructor_id: otherUserId }))
  await assert.rejects(wrong.api.getEvent(eventId), { code: 'invalid_data' })
  assert.throws(() => decodeHistoryEntry({ record, event: { ...event, id: otherUserId }, centre, instructor, reportAuthor: null, targetGrade: null }), { code: 'invalid_data' })
  assert.throws(() => decodeSummary({ pastSessions: 1, present: 2, late: 0, absent: 0, excused: 0, unmarked: 0,
    periodStart: null, periodEnd: null, cycleStart: '2026-01-01', cycleAttended: 0, consecutiveAbsences: 0, lastAttended: null }), { code: 'invalid_data' })
})

test('requests cancel before dispatch or during fetch without becoming an empty success', async () => {
  const before = new AbortController()
  before.abort()
  const setup = httpClient(async () => assert.fail('Aborted request must not reach HTTP'))
  await assert.rejects(setup.api.getStudents({ signal: before.signal }), { code: 'cancelled' })
  assert.equal(setup.requests.length, 0)
  const during = new AbortController()
  const live = httpClient(async request => {
    assert.ok(request.signal)
    during.abort()
    throw new DOMException('Request aborted', 'AbortError')
  })
  await assert.rejects(live.api.getStudents({ signal: during.signal }), { code: 'cancelled' })
})

test('unlinked instructor accounts receive an empty personal calendar and can read the class catalogue', async () => {
  const { api, requests } = httpClient(async (_request, url) => {
    assert.equal(url.pathname, '/rest/v1/class_types')
    return responsePage([{ id: 'database-class', label: 'Published class', description: '' }])
  }, { instructorRecord: null })
  const calendar = await api.getCalendar({ from: '2026-11-04T00:00:00+08:00', to: '2026-11-05T00:00:00+08:00' })
  assert.deepEqual(calendar, page([]))
  assert.deepEqual(await api.getAvailability({ from: '2026-11-04', to: '2026-11-05' }), page([]))
  assert.equal(await api.getEvent(eventId), null)
  assert.equal((await api.getClassTypes())[0].label, 'Published class')
  assert.ok(requests.every(request => request.method === 'GET'))
  assert.ok(!requests.some(request => /\/events|\/instructor_availability/.test(new URL(request.url).pathname)))
  await assert.rejects(api.getCurrentInstructor(), { code: 'instructor_not_found' })
})

test('availability creation sends only the authenticated-account fence and slot fields, including for unlinked accounts', async () => {
  const input = { date: '2030-01-02', startTime: '08:30', endTime: '09:30' }
  const { api, requests } = httpClient(async (request, url) => {
    assert.equal(url.pathname, '/rest/v1/rpc/create_instructor_availability')
    assert.equal(request.method, 'POST')
    assert.deepEqual(await request.json(), { expected_user: userId, slot_date: input.date, slot_start: input.startTime, slot_end: input.endTime })
    return Response.json({ id: eventId, instructor_id: instructorId, date: input.date, start_time: '08:30:00', end_time: '09:30:00' })
  }, { instructorRecord: null })
  const saved = await api.createAvailability(input)
  assert.equal(saved.instructor_id, instructorId)
  assert.notEqual(saved.instructor_id, userId)
  assert.ok(!requests.some(request => new URL(request.url).pathname === '/rest/v1/instructors'))
  const denied = createInstructorApi(fixtureClient({ profile: { id: userId, role: 'student' } }))
  await assert.rejects(denied.createAvailability(input), { code: 'forbidden' })
})

test('availability validation and conflict failures are explicit and never return a fake saved slot', async () => {
  const input = { date: '2030-01-02', startTime: '08:30', endTime: '09:30' }
  for (const [code, expected] of [['PAV01', 'conflict'], ['PAV02', 'conflict'], ['PAV03', 'invalid_request'], ['PAV04', 'instructor_not_found']]) {
    const { api } = httpClient(async () => Response.json({ code, message: 'private SQL detail' }, { status: 400 }))
    await assert.rejects(api.createAvailability(input), error => error.code === expected && !error.message.includes('private SQL detail'))
  }
  const setup = httpClient(async () => assert.fail('Invalid input must not reach the server'))
  for (const times of [{ startTime: '07:30', endTime: '08:30' }, { startTime: '09:00', endTime: '09:00' }, { startTime: '09:00', endTime: 'bad' }]) {
    await assert.rejects(setup.api.createAvailability({ ...input, ...times }), { code: 'invalid_request' })
  }
  assert.equal(setup.requests.length, 0)
  const networkFailure = httpClient(async () => { throw new Error('Network unavailable') })
  await assert.rejects(networkFailure.api.createAvailability(input), error =>
    error.code === 'request_failed' && error.message === 'Unable to save your availability. Please try again.')
})
