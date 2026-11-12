import assert from 'node:assert/strict'
import test from 'node:test'
import { adapters, calendarView, decoders, grading } from './helpers/instructor-modules.mjs'

const { studentGrading, readinessRequirementText, loadStudentGrading } = grading
const current = { id: 'stored-current', label: 'Current database grade', sort_order: 15, is_ranked: true, colour: 'Blue' }
const target = { ...current, id: 'stored-target', label: 'Next database grade', sort_order: 30 }
const item = { id: 'database/adult/target/basics/one', grade_id: target.id, track: 'adult', category: 'Basics', label: 'Stored technique', note: 'Stored syllabus note', sort_order: 1 }
const detail = { student: { id: 'student', date_of_birth: '2000-12-31', joined_at: '2020-01-01', last_graded_at: '2026-01-01',
  current_grade_id: current.id, membership_status: 'active', outstanding_fees: false }, grade: current }
const reads = { reference: { grades: [target, current], gradeTracks: [{ grade_id: current.id, track: 'adult' }, { grade_id: target.id, track: 'adult' }],
  gradeRequirements: [{ grade_id: target.id, track: 'adult', min_months: 3, max_months: 6, min_age_years: 15, max_age_years: null, min_sessions: 20 }], syllabusItems: [item] },
  summary: { cycleStart: '2026-01-01', cycleAttended: 20 }, signOffs: [], assessments: [] }

test('readiness uses stored grade ordering, published requirements and complete cycle attendance, excluding all technique sign-offs', () => {
  const result = studentGrading(detail, reads, '2026-11-05')
  assert.equal(result.target.id, target.id)
  assert.equal(result.ready, true)
  assert.equal(result.signOffs.length, 0)
  assert.equal(result.syllabus.length, 1)
  assert.deepEqual(result.requirements.map(row => row.key), ['membership', 'membership-length', 'age', 'time', 'sessions', 'fees'])
  assert.equal(result.requirements.find(row => row.key === 'time').met, true, 'maximum published range is not an expiration')
  assert.equal(result.status, 'Ready to start assessment')
  assert.deepEqual(reads.reference.grades.map(row => row.id), [target.id, current.id], 'reference inputs remain immutable')
})

test('missing grading rules, dates, joins, syllabus and session-cycle agreement never become a false ready result', () => {
  for (const [student, data] of [
    [{ ...detail.student, last_graded_at: null }, reads],
    [{ ...detail.student, joined_at: '2027-01-01' }, reads],
    [{ ...detail.student, date_of_birth: '2027-01-01' }, reads],
    [{ ...detail.student, membership_status: 'expired' }, reads],
    [{ ...detail.student, outstanding_fees: true }, reads],
    [{ ...detail.student, current_grade_id: 'unknown' }, reads],
    [detail.student, { ...reads, reference: { ...reads.reference, gradeRequirements: [] } }],
    [detail.student, { ...reads, summary: { ...reads.summary, cycleStart: '2025-01-01' } }],
    [detail.student, { ...reads, summary: { ...reads.summary, cycleAttended: 19 } }],
  ]) assert.equal(studentGrading({ ...detail, student }, data, '2026-11-05').ready, false)
  const noSyllabus = { ...reads, reference: { ...reads.reference, syllabusItems: [] } }
  assert.equal(studentGrading(detail, noSyllabus, '2026-11-05').ready, true, 'syllabus is not a readiness prerequisite')
  assert.equal(studentGrading(detail, noSyllabus, '2026-11-05').syllabus.length, 0)
  assert.equal(studentGrading(detail, { ...reads, reference: { ...reads.reference, grades: [current] } }, '2026-11-05').target, null)
})

test('unranked time begins at joining, year-of-thirteen changes tracks and month minima respect date boundaries', () => {
  const unranked = { ...current, is_ranked: false }
  const data = { ...reads, reference: { ...reads.reference, grades: [unranked, target], gradeRequirements: [{ ...reads.reference.gradeRequirements[0], min_age_years: null, min_sessions: null }] } }
  const student = { ...detail.student, last_graded_at: null, joined_at: '2026-08-31', date_of_birth: '2013-12-31' }
  const result = studentGrading({ ...detail, student }, data, '2026-11-30')
  assert.equal(result.track, 'adult')
  assert.equal(result.requirements.find(row => row.key === 'time').met, false)
  assert.equal(studentGrading({ ...detail, student }, data, '2026-12-01').ready, true)
})

test('stored sign-off identities/notes apply only to the actual student and target syllabus IDs', () => {
  const signOff = { student_id: detail.student.id, syllabus_item_id: item.id, signed_off_at: '2026-11-02T17:00:00Z', signed_off_by: null, note: 'Stored sign-off note' }
  const view = studentGrading(detail, { ...reads, signOffs: [{ signOff, instructor: null },
    { signOff: { ...signOff, syllabus_item_id: 'earlier-grade-item' }, instructor: null },
    { signOff: { ...signOff, student_id: 'another-student' }, instructor: null }] }, '2026-11-05')
  assert.equal(view.signOffs.length, 1)
  assert.equal(view.signOffs[0].signOff, signOff)
  assert.equal(view.signOffs[0].instructor, null)
})

test('date-only events retain null timestamps; release metadata controls only actual reporting-time display', () => {
  const base = { id: '00000000-0000-4000-8000-000000000001', centre_id: '00000000-0000-4000-8000-000000000002', instructor_id: null,
    event_type: 'grading', starts_at: null, ends_at: null, name: 'Official grading', status: 'scheduled', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
  assert.equal(decoders.decodeEvent(base).starts_at, null)
  for (const event of [{ ...base, event_type: 'class' }, { ...base, starts_at: '2026-11-05T02:00:00Z' }]) assert.throws(() => decoders.decodeEvent(event), { code: 'invalid_data' })
  const schedule = { grading_date: '2026-12-13', reporting_release_on: '2026-12-06', reporting_time: '10:30:00' }
  assert.equal(adapters.publishedReportingTime(schedule, '2026-12-05'), null)
  assert.equal(adapters.publishedReportingTime(schedule, '2026-12-06'), '10:30:00')
  assert.equal(adapters.publishedReportingTime({ ...schedule, reporting_release_on: null }, '2026-12-07'), null)
  const event = calendarView.toCalendarViewEvent({ event: base, grading: { ...schedule, reporting_time: null }, rosterCount: 0 })
  assert.equal(event.startsAt, null)
  assert.equal(event.endsAt, null)
  assert.equal(calendarView.calendarTimeLabel(event), 'Time not published')
  assert.equal(calendarView.calendarEventsForDate([event], new Date(2026, 11, 13)).length, 1)
  assert.equal(calendarView.calendarEventsForDate([event], new Date(2026, 11, 12)).length, 0)
  assert.throws(() => calendarView.toCalendarViewEvent({ event: base, grading: null }), { code: 'invalid_data' })
})

test('structured requirement values preserve unknown dates, units and published ranges', () => {
  assert.deepEqual(readinessRequirementText({ key: 'time', actual: null, required: '3–6', met: null }, false),
    { label: 'Time in current grade', actual: 'Not recorded', required: '3–6 months' })
  assert.deepEqual(readinessRequirementText({ key: 'time', actual: 1, required: 3, met: false }, true),
    { label: 'Practice since joining', actual: '1 month', required: '3 months' })
  assert.deepEqual(readinessRequirementText({ key: 'fees', actual: 'outstanding', required: 'clear', met: false }, false),
    { label: 'Fees up to date', actual: 'Outstanding', required: 'Clear' })
})

test('grading loaders follow every recorded assessment page; partial failures/cancellation never yield a partial successful read', async () => {
  const signal = new AbortController().signal
  const requests = []
  const items = Array.from({ length: 205 }, (_, index) => ({ record: { event_id: `event-${index}`, student_id: 'student' } }))
  const api = { getReferenceData: async () => reads.reference, getStudentSummary: async () => reads.summary, getTechniqueSignOffs: async () => [],
    getRecordedAssessments: async (id, options) => { assert.equal(id, 'student'); requests.push(options.offset); return {
      items: items.slice(options.offset, options.offset + 40), total: 205, offset: options.offset, limit: options.limit,
    } } }
  assert.equal((await loadStudentGrading(api, 'student', signal)).assessments.length, 205)
  assert.deepEqual(requests, [0, 40, 80, 120, 160, 200])
  await assert.rejects(loadStudentGrading({ ...api, getTechniqueSignOffs: async () => { throw new Error('Read failed') } }, 'student', signal), /Read failed/)
  const controller = new AbortController(); controller.abort()
  await assert.rejects(loadStudentGrading(api, 'student', controller.signal), { name: 'AbortError' })
})

test('gradings the caller examines split into one calendar block per sorted session', () => {
  const eventId = '00000000-0000-4000-8000-000000000101'
  const centreId = '00000000-0000-4000-8000-000000000102'
  const [first, second] = ['00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202']
  const grade = (id, label, sort_order) => ({ id, label, colour: 'Blue', is_ranked: true, sort_order })
  const [blue, brown, dan] = [grade('blue-6th-kyu', 'Blue (6th Kyu)', 7), grade('brown-4th-kyu', 'Brown (4th Kyu)', 10), grade('1st-dan', '1st Dan', 17)]
  const raw = (overrides = {}) => ({
    id: eventId, centre_id: centreId, instructor_id: null, event_type: 'grading', name: 'Adult grading — 14 Nov 2026',
    starts_at: '2026-11-14T02:00:00Z', ends_at: '2026-11-14T04:00:00Z', status: 'scheduled',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    centre: { id: centreId, name: 'HQ', short_name: 'hq', address: '', timezone: 'Asia/Singapore', status: 'active', capacity: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    class: null, seminar: null, workshop: null, participants: [{ count: 3 }], on_panel: true,
    grading: { event_id: eventId, track: 'adult', application_deadline: '2026-11-13', application_status: 'open', grading_date: '2026-11-14',
      application_opens_on: '2026-10-28', reporting_release_on: '2026-11-12', reporting_time: '10:00:00', official_schedule: true,
      target_grades: [{ grade: blue }, { grade: brown }, { grade: dan }],
      // Session 1 holds two grades after an administrator moved a student.
      sessions: [
        { id: first, position: 1, starts_at: '2026-11-14T02:00:00Z', ends_at: '2026-11-14T02:30:00Z', candidates: 3, grades: [blue, brown] },
        { id: second, position: 2, starts_at: '2026-11-14T02:30:00Z', ends_at: '2026-11-14T03:00:00Z', candidates: 1, grades: [dan] },
      ] },
    ...overrides,
  })
  const entry = decoders.decodeCalendarEntry(raw())
  assert.equal(entry.onPanel, true)
  assert.deepEqual(entry.targetGrades.map(row => row.id), ['blue-6th-kyu', 'brown-4th-kyu', '1st-dan'])
  assert.deepEqual(entry.gradeSessions.map(row => [row.position, row.grades.map(item => item.id), row.candidates, row.startsAt]),
    [[1, ['blue-6th-kyu', 'brown-4th-kyu'], 3, '2026-11-14T02:00:00Z'], [2, ['1st-dan'], 1, '2026-11-14T02:30:00Z']])
  const blocks = calendarView.toCalendarViewEvents(entry)
  assert.deepEqual(blocks.map(block => [block.name, block.startTime, block.endTime, block.rosterCount]), [
    ['Session 1 · Adult grading', '10:00', '10:30', 3],
    ['Session 2 · Adult grading', '10:30', '11:00', 1],
  ])
  assert.deepEqual(blocks.map(block => block.gradeSession), [{ eventId, sessionId: first }, { eventId, sessionId: second }])
  assert.equal(new Set(blocks.map(block => block.id)).size, 2)
  assert.equal(calendarView.calendarEventsForDate(blocks, new Date(2026, 10, 14)).length, 2)
  // Not on the panel, not yet sorted, or a table read without sessions: one grading block as before.
  for (const other of [raw({ on_panel: false }), (() => { const item = raw(); item.grading.sessions = []; return item })(),
    (() => { const item = raw(); delete item.on_panel; delete item.grading.sessions; return item })()]) {
    const [single, ...rest] = calendarView.toCalendarViewEvents(decoders.decodeCalendarEntry(other))
    assert.equal(rest.length, 0)
    assert.equal(single.id, eventId)
    assert.equal(single.gradeSession, undefined)
  }
  for (const bad of [raw({ on_panel: 'yes' }), (() => { const item = raw(); item.grading.sessions[0].ends_at = null; return item })(),
    (() => { const item = raw(); item.grading.sessions[0].id = 'not-a-uuid'; return item })()]) {
    assert.throws(() => decoders.decodeCalendarEntry(bad), { code: 'invalid_data' })
  }
})

test('a grade with a maximum age (Junior Dan) is skipped once the student is older', () => {
  const junior = { ...current, id: 'junior-dan', label: 'Junior Dan', sort_order: 20 }
  const data = { ...reads, reference: { ...reads.reference, grades: [current, junior, target],
    gradeTracks: [...reads.reference.gradeTracks, { grade_id: junior.id, track: 'adult' }],
    gradeRequirements: [...reads.reference.gradeRequirements,
      { grade_id: junior.id, track: 'adult', min_months: 9, max_months: null, min_age_years: null, max_age_years: 14, min_sessions: 62 }] } }
  assert.equal(studentGrading(detail, data, '2026-11-05').target.id, target.id, 'aged 26 by year: straight to the next Dan grade')
  const young = studentGrading({ ...detail, student: { ...detail.student, date_of_birth: '2012-03-01' } }, data, '2026-11-05')
  assert.equal(young.target.id, junior.id)
  assert.deepEqual(young.requirements.find(row => row.key === 'max-age'), { key: 'max-age', actual: 14, required: 14, met: true })
  assert.deepEqual(readinessRequirementText(young.requirements.find(row => row.key === 'max-age'), false),
    { label: 'Maximum age (by calendar year)', actual: '14 years', required: '14 years' })
})

test('a child at the top of the children ladder is shown the next adult grade, gated on turning 13', () => {
  const silver = { ...current, id: 'black-silver', label: 'Black-Silver (2nd Kyu)', sort_order: 14 }
  const blackGold = { ...current, id: 'black-gold', label: 'Black-Gold (1st Kyu)', sort_order: 15 }
  const adultItem = { ...item, id: 'adult/black-gold/one', grade_id: blackGold.id, track: 'adult' }
  const data = { ...reads, reference: { grades: [silver, blackGold],
    gradeTracks: [{ grade_id: silver.id, track: 'children' }, { grade_id: blackGold.id, track: 'adult' }],
    gradeRequirements: [{ grade_id: blackGold.id, track: 'adult', min_months: 9, max_months: null, min_age_years: null, max_age_years: null, min_sessions: 62 }],
    syllabusItems: [adultItem] } }
  const child = { ...detail, student: { ...detail.student, date_of_birth: '2016-05-01', current_grade_id: silver.id } }
  const result = studentGrading(child, data, '2026-11-05')
  assert.equal(result.track, 'children')
  assert.equal(result.targetTrack, 'adult')
  assert.equal(result.target.id, blackGold.id)
  assert.deepEqual(result.requirements.find(row => row.key === 'adult-age'), { key: 'adult-age', actual: 10, required: 13, met: false })
  assert.deepEqual(result.syllabus.map(row => row.id), [adultItem.id])
  assert.equal(result.ready, false)
})

test('an intermediate grade from an adult grading submits directly; one from a children grading does not', () => {
  const silver = { ...current, id: 'black-silver-2nd-kyu', label: 'Black-Silver (2nd Kyu)', sort_order: 14 }
  const blackGold = { ...current, id: 'black-gold', label: 'Black-Gold (1st Kyu)', sort_order: 15 }
  const data = { ...reads, reference: { grades: [silver, blackGold],
    gradeTracks: [{ grade_id: silver.id, track: 'children' }, { grade_id: blackGold.id, track: 'adult' }],
    gradeRequirements: [{ grade_id: blackGold.id, track: 'adult', min_months: 9, max_months: null, min_age_years: null, max_age_years: null, min_sessions: 62 }],
    syllabusItems: [] } }
  const adultAward = studentGrading({ ...detail, student: { ...detail.student, current_grade_id: silver.id, last_graded_at: '2026-10-01' } }, data, '2026-11-05')
  assert.deepEqual(adultAward.requirements.map(row => row.key), ['membership', 'membership-length', 'direct-entry', 'fees'])
  assert.equal(adultAward.ready, true)
  assert.equal(readinessRequirementText(adultAward.requirements[2], false).actual, 'Submit directly')
  const childAward = studentGrading({ ...detail, student: { ...detail.student, date_of_birth: '2012-01-01', current_grade_id: silver.id,
    last_graded_at: '2024-06-01' } }, { ...data, summary: { cycleStart: '2024-06-01', cycleAttended: 70 } }, '2026-11-05')
  assert.deepEqual(childAward.requirements.map(row => row.key), ['membership', 'membership-length', 'time', 'sessions', 'fees'])
})
