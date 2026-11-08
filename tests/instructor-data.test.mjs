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
        select(columns) { if (table === 'instructors') assert.ok(!columns.includes('updated_at')); return this },
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
  // Other row fixtures reuse the metadata above, but instructors no longer have
  // updated_at. Exercise the current database shape explicitly.
  const record = { ...instructor }
  delete record.updated_at
  assert.equal((await createInstructorApi(fixtureClient({ record })).getCurrentInstructor()).instructorId, instructorId)
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
  return { api: createInstructorApi(client), requests, client }
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
  assessment_status: null, assessment_notes: null, checked_in_at: null,
}
const page = (items, total = items.length, offset = 0, limit = 50) => ({ items, total, offset, limit })
const responsePage = (items, total = items.length) => Response.json(items, { headers: { 'content-range': `0-${Math.max(0, items.length - 1)}/${total}` } })

test('availability eligibility comes from the database and a missing part-time identity is denied', async () => {
  for (const id of [instructorId, null]) {
    const f = httpClient((_request, url) => {
      assert.equal(url.pathname, '/rest/v1/rpc/current_part_time_instructor_id')
      return Response.json(id)
    })
    assert.equal(await f.api.getAvailabilityAccess(), id !== null)
  }
  const f = httpClient(() => Response.json({ code: 'PAV06', message: 'Private database details' }, { status: 403 }))
  await assert.rejects(f.api.createAvailability({ date: '2026-11-30', startTime: '08:00', endTime: '09:00' }),
    { code: 'forbidden', message: 'Availability is only available to part-time instructors.' })
})

test('each attendance load verifies ownership once, follows all pages and rejects reassignment', async () => {
  let assigned = true
  let authReads = 0
  const secondStudentId = '00000000-0000-4000-8000-000000000099'
  const rows = [
    { ...record, student },
    { ...record, student_id: secondStudentId, student: { ...student, id: secondStudentId } },
  ]
  const { api, requests, client } = httpClient(async (_request, url) => {
    if (url.pathname === '/rest/v1/events') {
      assert.equal(url.searchParams.get('instructor_id'), `eq.${instructorId}`)
      return Response.json(assigned ? calendarEntry : null)
    }
    assert.equal(url.pathname, '/rest/v1/event_students')
    assert.equal(url.searchParams.get('event_id'), `eq.${eventId}`)
    const offset = Number(url.searchParams.get('offset') ?? 0)
    return responsePage(rows.slice(offset, offset + 1), rows.length)
  })
  client.auth.getUser = async () => { authReads++; return { data: { user: { id: userId } }, error: null } }
  const signal = new AbortController().signal
  for (let open = 0; open < 2; open++) {
    const before = requests.length
    const result = await api.getAttendanceRoster(eventId, signal)
    assert.equal(result.entries.length, 2)
    assert.deepEqual(requests.slice(before).map(request => new URL(request.url).pathname), [
      '/rest/v1/users', '/rest/v1/instructors', '/rest/v1/events', '/rest/v1/event_students', '/rest/v1/event_students',
    ])
  }
  assert.equal(authReads, 2)
  assigned = false
  const before = requests.length
  await assert.rejects(api.getAttendanceRoster(eventId, signal), { code: 'forbidden' })
  assert.deepEqual(requests.slice(before).map(request => new URL(request.url).pathname), ['/rest/v1/users', '/rest/v1/instructors', '/rest/v1/events'])
  assert.equal(authReads, 3)
})

test('attendance loads reject an event returned for another instructor', async () => {
  const { api, requests } = httpClient(async (_request, url) => {
    assert.equal(url.pathname, '/rest/v1/events')
    return Response.json({ ...calendarEntry, instructor_id: otherUserId })
  })
  await assert.rejects(api.getAttendanceRoster(eventId, new AbortController().signal), { code: 'invalid_data' })
  assert.ok(!requests.some(request => new URL(request.url).pathname === '/rest/v1/event_students'))
})

test('attendance and session writes independently verify the account after a roster load', async () => {
  let authReads = 0
  const { api, requests, client } = httpClient(async (request, url) => {
    if (url.pathname === '/rest/v1/events') return Response.json(calendarEntry)
    if (url.pathname === '/rest/v1/event_students') return responsePage([{ ...record, student }])
    const body = await request.json()
    if (url.pathname === '/rest/v1/rpc/save_instructor_attendance') return Response.json({
      requestId: body.request_id, eventId, attendance: body.expected_attendance.map(row => ({ ...row, status: body.new_status })),
    })
    assert.equal(url.pathname, '/rest/v1/rpc/save_instructor_session_record')
    return Response.json({ requestId: body.request_id, eventId, studentId, kind: body.write_kind,
      value: body.new_value })
  })
  client.auth.getUser = async () => { authReads++; return { data: { user: { id: userId } }, error: null } }
  await api.getAttendanceRoster(eventId, new AbortController().signal)
  const key = { requestId: otherUserId, expectedUserId: userId, eventId, studentId }
  const pathsAfter = async operation => {
    const before = requests.length
    await operation()
    return requests.slice(before).map(request => new URL(request.url).pathname)
  }
  assert.deepEqual(await pathsAfter(() => api.saveAttendance({ ...key, scope: 'student', status: 'present',
    expected: [{ studentId, status: null, recordedAt: null, checkedInAt: null }] })), ['/rest/v1/users', '/rest/v1/rpc/save_instructor_attendance'])
  for (const operation of [
    () => api.saveAssessment({ ...key, status: null, notes: null, expected: { status: null, notes: null } }),
  ]) assert.deepEqual(await pathsAfter(operation), ['/rest/v1/users', '/rest/v1/instructors', '/rest/v1/rpc/save_instructor_session_record'])
  assert.equal(authReads, 3, 'the read and each write independently verify the current account')
})

test('assessment saves send narrow snapshots with account fences and validate authoritative results', async () => {
  const requests = []
  const { api } = httpClient(async (request, url) => {
    assert.equal(url.pathname, '/rest/v1/rpc/save_instructor_session_record')
    const body = await request.json(); requests.push(body)
    assert.equal(body.expected_user, userId)
    assert.equal(body.target_event, eventId)
    assert.equal(body.target_student, studentId)
    assert.deepEqual(Object.keys(body).sort(), ['expected_record','expected_user','new_value','request_id','target_event','target_student','write_kind'])
    return Response.json({ requestId: body.request_id, eventId, studentId, kind: body.write_kind,
      value: body.new_value })
  })
  const key = { requestId: otherUserId, expectedUserId: userId, eventId, studentId }
  const assessment = { ...key, status: 'completed', notes: '  Saved notes\nSecond line  ', expected: { status: null, notes: null } }
  const saved = await api.saveAssessment(assessment)
  assert.equal(saved.value.status, 'completed')
  assert.equal(requests[0].new_value.notes, 'Saved notes\nSecond line')
  assert.equal('reportAuthorId' in requests[0].new_value, false)
  await api.saveAssessment(assessment)
  assert.deepEqual(requests[0], requests[1], 'network retry keeps the same request ID and intent')
  await api.saveAssessment({ ...key, requestId: instructorId, status: null, notes: 'Notes without inferred pending', expected: { status: null, notes: null } })
  assert.equal(requests[2].new_value.status, null)
  assert.deepEqual(Object.keys(requests[2].new_value).sort(), ['notes','status'])
})

test('saved assessment response mismatches and conflict/permission errors remain failures', async () => {
  const input = { requestId: otherUserId, expectedUserId: userId, eventId, studentId, status: 'completed', notes: 'New', expected: { status: null, notes: null } }
  const result = { requestId: otherUserId, eventId, studentId, kind: 'assessment', value: { status: 'completed', notes: 'New' } }
  for (const invalid of [{ ...result, studentId: userId }, { ...result, eventId: userId }, { ...result, requestId: userId },
    { ...result, value: { ...result.value, status: 'pending' } }, { ...result, value: { ...result.value, notes: 'Different text' } },
    { ...result, kind: 'report', value: { report: 'Retired', reportAuthorId: instructorId } }]) {
    await assert.rejects(httpClient(async () => Response.json(invalid)).api.saveAssessment(input), { code: 'invalid_data' })
  }
  for (const [code, expected] of [['PRS01','conflict'], ['PRS03','forbidden']]) {
    await assert.rejects(httpClient(async () => Response.json({ code, message: 'Private SQL details' }, { status: 400 })).api.saveAssessment(input),
      error => error.code === expected && !error.message.includes('Private SQL details'))
  }
  await assert.rejects(httpClient(async () => assert.fail('Old account must not dispatch a mutation')).api.saveAssessment({ ...input, expectedUserId: otherUserId }), { code: 'forbidden' })
})

test('retired report services are no longer exposed', () => {
  const { api } = httpClient(async () => assert.fail('No report requests should be sent'))
  for (const name of ['saveReport', 'getReport', 'getSessionReports']) assert.equal(name in api, false)
})

test('attendance sends account-fenced immutable snapshots and stable request IDs, including complete rosters beyond 100 rows', async () => {
  const expected = Array.from({ length: 205 }, (_, index) => ({ studentId: `00000000-0000-4000-8000-${String(9000 + index).padStart(12, '0')}`,
    status: null, recordedAt: null, checkedInAt: null }))
  const input = { requestId: otherUserId, expectedUserId: userId, eventId, scope: 'roster', status: 'present', expected }
  const requests = []
  const { api } = httpClient(async (request, url) => {
    assert.equal(url.pathname, '/rest/v1/rpc/save_instructor_attendance')
    const body = await request.json(); requests.push(body)
    assert.equal(body.expected_user, userId)
    assert.equal(body.request_id, body.save_scope === 'roster' ? otherUserId : instructorId)
    assert.equal(body.target_event, eventId)
    assert.equal(body.expected_attendance.length, body.save_scope === 'roster' ? 205 : 1)
    assert.deepEqual(Object.keys(body).sort(), ['expected_attendance', 'expected_user', 'new_status', 'request_id', 'save_scope', 'target_event'])
    return Response.json({ requestId: body.request_id, eventId: body.target_event,
      attendance: body.expected_attendance.map(row => ({ ...row, status: body.new_status })) })
  })
  assert.equal((await api.saveAttendance(input)).attendance.length, 205)
  await api.saveAttendance(input)
  assert.deepEqual(requests[0], requests[1], 'retry does not generate a new request identity or snapshot')
  await api.saveAttendance({ ...input, requestId: instructorId, scope: 'student', status: 'unmarked', expected: expected.slice(0, 1) })
  assert.equal(requests[2].new_status, null)
  assert.ok(expected.every(row => row.status === null && row.checkedInAt === null))
})

test('attendance save and authoritative reload baseline counts actual service requests and serialized payloads', async t => {
  for (const size of [1, 205]) {
    const rows = Array.from({ length: size }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(9000 + index).padStart(12, '0')}`
      return { ...record, student_id: id, student: { ...student, id } }
    })
    let authReads = 0
    let payloadBytes = 0
    const { api, requests, client } = httpClient(async (request, url) => {
      if (url.pathname === '/rest/v1/events') return Response.json(calendarEntry)
      if (url.pathname === '/rest/v1/event_students') {
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? 100)
        return responsePage(rows.slice(offset, offset + limit), size)
      }
      assert.equal(url.pathname, '/rest/v1/rpc/save_instructor_attendance')
      const text = await request.text()
      payloadBytes = Buffer.byteLength(text)
      const body = JSON.parse(text)
      assert.equal(body.save_scope, size === 1 ? 'student' : 'roster')
      assert.equal(body.expected_attendance.length, size)
      return Response.json({ requestId: body.request_id, eventId: body.target_event, attendance: body.expected_attendance })
    })
    client.auth.getUser = async () => { authReads++; return { data: { user: { id: userId } }, error: null } }
    await api.saveAttendance({ requestId: otherUserId, expectedUserId: userId, eventId, scope: size === 1 ? 'student' : 'roster',
      status: 'present', expected: rows.map(row => ({ studentId: row.student_id, status: null, recordedAt: null, checkedInAt: null })) })
    const result = await api.getAttendanceRoster(eventId, new AbortController().signal)
    const paths = requests.map(request => new URL(request.url).pathname)
    assert.equal(result.entries.length, size)
    assert.equal(authReads, 2)
    assert.deepEqual(paths, ['/rest/v1/users', '/rest/v1/rpc/save_instructor_attendance',
      '/rest/v1/users', '/rest/v1/instructors', '/rest/v1/events', ...Array(Math.ceil(size / 100)).fill('/rest/v1/event_students')])
    t.diagnostic(`${size} row(s): ${payloadBytes} JSON bytes, ${paths.length} mocked REST requests and ${authReads} mocked auth checks; no network timings`)
  }
})

test('attendance rejects malformed/incomplete actions before dispatch and fences an old form from a replacement account', async () => {
  const input = { requestId: otherUserId, expectedUserId: userId, eventId, scope: 'student', status: 'present',
    expected: [{ studentId, status: null, recordedAt: null, checkedInAt: null }] }
  const setup = httpClient(async () => assert.fail('Invalid attendance must not reach HTTP'))
  for (const invalid of [{ ...input, status: 'late' }, { ...input, scope: 'other' }, { ...input, expected: [] },
    { ...input, scope: 'roster', expected: [input.expected[0], input.expected[0]] }]) await assert.rejects(setup.api.saveAttendance(invalid), { code: 'invalid_request' })
  assert.equal(setup.requests.length, 0)
  const replacement = createInstructorApi(fixtureClient({ user: { id: otherUserId }, profile: { id: otherUserId, role: 'instructor' } }))
  await assert.rejects(replacement.saveAttendance(input), { code: 'forbidden' })
})

test('attendance conflicts/read-only failures and malformed success responses cannot become local save successes', async () => {
  const input = { requestId: otherUserId, expectedUserId: userId, eventId, scope: 'student', status: 'present',
    expected: [{ studentId, status: null, recordedAt: null, checkedInAt: null }] }
  for (const [code, expected] of [['PAT01', 'conflict'], ['PAT02', 'forbidden'], ['PAT03', 'forbidden']]) {
    await assert.rejects(httpClient(async () => Response.json({ code, message: 'Private database detail' }, { status: 400 })).api.saveAttendance(input),
      error => error.code === expected && !error.message.includes('Private database detail'))
  }
  for (const result of [
    { requestId: userId, eventId, attendance: input.expected },
    { requestId: otherUserId, eventId: studentId, attendance: input.expected },
    { requestId: otherUserId, eventId, attendance: [] },
    { requestId: otherUserId, eventId, attendance: [input.expected[0], input.expected[0]] },
  ]) await assert.rejects(httpClient(async () => Response.json(result)).api.saveAttendance(input), { code: 'invalid_data' })
})

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
  const { api } = httpClient(async (request, url) => {
    if (url.pathname === '/rest/v1/rpc/instructor_calendar') {
      assert.deepEqual(await request.json(), { range_from: '2026-11-04T00:00:00+08:00', range_to: '2026-11-06T00:00:00+08:00', page_size: 50, page_offset: 0 })
      return Response.json(page([calendarEntry]))
    }
    assert.equal(url.searchParams.get('instructor_id'), `eq.${instructorId}`)
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

test('calendar RPC decodes date-only grading metadata and rejects wrong-account or mismatched pages', async () => {
  const schedule = { event_id: eventId, track: 'adult', application_deadline: '2026-11-01', application_status: 'closed',
    grading_date: '2026-11-05', application_opens_on: '2026-10-01', reporting_release_on: '2026-11-04', reporting_time: null, official_schedule: true, target_grades: [] }
  const dateOnlyEntry = { ...calendarEntry, event_type: 'grading', starts_at: null, ends_at: null, grading: schedule }
  const options = { from: '2026-11-04T00:00:00+08:00', to: '2026-11-06T00:00:00+08:00', offset: 3, limit: 1 }
  const response = await httpClient(async (_request, url) => {
    assert.equal(url.pathname, '/rest/v1/rpc/instructor_calendar')
    return Response.json(page([dateOnlyEntry], 4, 3, 1))
  }).api.getCalendar(options)
  assert.equal(response.items[0].event.starts_at, null)
  assert.equal(response.items[0].grading.grading_date, '2026-11-05')
  assert.equal(response.items[0].grading.reporting_time, null)
  for (const invalid of [page([dateOnlyEntry], 4, 0, 1), page([{ ...dateOnlyEntry, instructor_id: otherUserId }], 4, 3, 1)]) {
    await assert.rejects(httpClient(async () => Response.json(invalid)).api.getCalendar(options), { code: 'invalid_data' })
  }
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
      grading: { event_id: eventId, track: null, application_deadline: null, application_status: 'closed', target_grades: [],
        grading_date: null, application_opens_on: null, reporting_release_on: null, reporting_time: null, official_schedule: false } })
    if (url.pathname === '/rest/v1/event_students') return Response.json({ ...record, student })
    assert.equal(url.pathname, '/rest/v1/grading_applications')
    assert.equal(url.searchParams.get('grading_event_id'), `eq.${eventId}`)
    assert.equal(url.searchParams.get('student_id'), `eq.${studentId}`)
    return Response.json(null)
  })
  const result = await api.getAssessment({ eventId, studentId })
  assert.equal(result.record.assessment_status, null)
  assert.equal(result.application, null)
  assert.equal(result.targetGrade, null)
  assert.equal(result.session.grading.track, null)
})

test('assessment target labels come from the recorded application join, including unknown joins and identity rejection', async () => {
  const target = { ...grade, id: 'actual-application-target', label: 'Actual application target', is_ranked: true, sort_order: 99 }
  const application = { id: userId, student_id: studentId, grading_event_id: eventId, target_grade_id: target.id,
    submitted_at: metadata.created_at, status: 'submitted', notes: null, target_grade: target }
  const session = { ...calendarEntry, event_type: 'grading', grading: { event_id: eventId, track: 'adult', application_deadline: null,
    application_status: 'closed', target_grades: [], grading_date: null, application_opens_on: null, reporting_release_on: null, reporting_time: null, official_schedule: false } }
  const setup = (app, enrollment = { ...record, student }) => httpClient(async (_request, url) => {
    if (url.pathname === '/rest/v1/events') return Response.json(session)
    if (url.pathname === '/rest/v1/event_students') return Response.json(enrollment)
    assert.match(url.searchParams.get('select'), /target_grade:grades/)
    return Response.json(app)
  }).api.getAssessment({ eventId, studentId })
  const result = await setup(application)
  assert.equal(result.targetGrade.label, target.label)
  assert.notEqual(result.targetGrade.id, student.current_grade_id)
  assert.equal(result.session.targetGrades.length, 0, 'event catalogue does not replace a recorded application target')
  assert.equal((await setup({ ...application, target_grade: null })).targetGrade, null)
  assert.equal(await setup(application, null), null, 'an application alone is not an event/student assessment record')
  for (const app of [{ ...application, student_id: otherUserId }, { ...application, grading_event_id: otherUserId },
    { ...application, target_grade: { ...target, id: 'wrong-grade' } }]) await assert.rejects(setup(app), { code: 'invalid_data' })
  await assert.rejects(setup(application, { ...record, event_id: otherUserId, student }), { code: 'invalid_data' })
})

test('rosters, sign-offs and zero attendance summaries keep their real nullable values', async () => {
  const { api } = httpClient(async (_request, url) => {
    switch (url.pathname) {
      case '/rest/v1/events': return Response.json(calendarEntry)
      case '/rest/v1/event_students': return responsePage([{ ...record, attendance_status: 'excused', student }])
      case '/rest/v1/technique_sign_offs': return responsePage([{
        id: userId, student_id: studentId, syllabus_item_id: 'database/item', signed_off_at: metadata.created_at,
        signed_off_by: null, note: null, instructor: null,
      }])
      case '/rest/v1/rpc/instructor_student_summary': return Response.json({
        pastSessions: 0, present: 0, late: 0, absent: 0, excused: 0, unmarked: 0,
        cycleStart: '2020-01-01', cycleAttended: 0, consecutiveAbsences: 0,
        periodStart: null, periodEnd: null, lastAttended: null,
      })
      default: assert.fail(`Unexpected read ${url.pathname}`)
    }
  })
  assert.equal((await api.getRoster(eventId)).items[0].record.attendance_status, 'excused')
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

test('directory pages reject server responses with mismatched pagination metadata', async () => {
  const { api } = httpClient(async () => Response.json({ ...page([], 0, 0, 50), scopeTotal: 0,
    facets: { grades: [], colours: [], centres: [] } }))
  await assert.rejects(api.getStudents({ offset: 50 }), { code: 'invalid_data' })
})

test('all student reads work for verified instructors without a domain link', async () => {
  const { api, requests } = httpClient(async (_request, url) => {
    switch (url.pathname) {
      case '/rest/v1/rpc/instructor_student_directory': return Response.json({ ...page([student]), scopeTotal: 1,
        facets: { grades: [grade], colours: [], centres: [centre] } })
      case '/rest/v1/students': return Response.json({ ...student, emergency_contacts: [], medical_alerts: [] })
      case '/rest/v1/rpc/instructor_student_history': return Response.json(page([]))
      case '/rest/v1/rpc/instructor_student_summary': return Response.json({
        pastSessions: 0, present: 0, late: 0, absent: 0, excused: 0, unmarked: 0, periodStart: null, periodEnd: null,
        cycleStart: '2020-01-01', cycleAttended: 0, consecutiveAbsences: 0, lastAttended: null,
      })
      case '/rest/v1/technique_sign_offs': return responsePage([])
      default: assert.fail(`Unexpected read ${url.pathname}`)
    }
  }, { instructorRecord: null })
  assert.equal((await api.getStudents()).items[0].student.id, studentId)
  assert.equal((await api.getStudentDetail(studentId)).student.id, studentId)
  assert.equal((await api.getStudentHistory(studentId)).total, 0)
  assert.equal((await api.getStudentSummary(studentId)).pastSessions, 0)
  assert.deepEqual(await api.getTechniqueSignOffs(studentId), [])
  assert.ok(!requests.some(request => new URL(request.url).pathname === '/rest/v1/instructors'))
  const denied = createInstructorApi(fixtureClient({ profile: { id: userId, role: 'student' } }))
  for (const read of [() => denied.getStudents(), () => denied.getStudentDetail(studentId),
    () => denied.getStudentHistory(studentId), () => denied.getStudentSummary(studentId), () => denied.getTechniqueSignOffs(studentId)]) {
    await assert.rejects(read(), { code: 'forbidden' })
  }
})
