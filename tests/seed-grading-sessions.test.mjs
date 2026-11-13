import assert from 'node:assert/strict'
import test from 'node:test'
import { buildGradingSessionPlan, gradingSessionDates, gradingSessionId, singaporeDate } from '../scripts/seed-grading-sessions.mjs'

const examiners = [{ id: 'e1' }, { id: 'e2' }]
const gradeTracks = [
  { grade_id: 'blue-6th-kyu', track: 'adult' }, { grade_id: 'blue-6th-kyu', track: 'children' },
  { grade_id: '1st-dan', track: 'adult' }, { grade_id: 'red-12th-kyu', track: 'children' },
]
const options = { today: '2026-11-11', centreId: 'centre', examiners, gradeTracks }

test('three future dates fall in this Singapore week or the next', () => {
  assert.equal(singaporeDate(new Date('2026-11-10T16:30:00Z')), '2026-11-11')
  assert.deepEqual(gradingSessionDates('2026-11-11'),
    { weekStart: '2026-11-09', weekEndExclusive: '2026-11-23', dates: ['2026-11-14', '2026-11-18', '2026-11-21'] })
  // On Saturday, this Saturday has started, so all three come from next week.
  assert.deepEqual(gradingSessionDates('2026-11-14').dates, ['2026-11-18', '2026-11-21', '2026-11-22'])
  for (const today of ['2026-11-09', '2026-11-12', '2026-11-15']) {
    const { dates, weekStart, weekEndExclusive } = gradingSessionDates(today)
    assert.equal(dates.length, 3, today)
    assert.ok(dates.every(date => date > today && date >= weekStart && date < weekEndExclusive), today)
  }
})

test('sessions are scheduled official gradings with valid application windows', () => {
  const { sessions } = buildGradingSessionPlan(options)
  assert.deepEqual(sessions.map(row => [row.grading.grading_date, row.grading.track]),
    [['2026-11-14', 'adult'], ['2026-11-18', 'children'], ['2026-11-21', 'adult']])
  assert.deepEqual(sessions.map(row => row.event.name),
    ['Adult grading — 14 Nov 2026', "Children's grading — 18 Nov 2026", 'Adult grading — 21 Nov 2026'])
  for (const { event, grading } of sessions) {
    assert.equal(event.event_type, 'grading')
    assert.equal(event.status, 'scheduled')
    assert.ok(Date.parse(event.ends_at) > Date.parse(event.starts_at))
    assert.ok(event.starts_at.startsWith(grading.grading_date))
    assert.equal(grading.official_schedule, true)
    assert.ok(grading.application_opens_on <= grading.application_deadline)
    assert.ok(grading.application_deadline < grading.grading_date)
    assert.ok(grading.reporting_release_on <= grading.grading_date)
  }
  assert.equal(sessions[0].event.starts_at, '2026-11-14T10:00:00+08:00')
  assert.equal(sessions[1].event.starts_at, '2026-11-18T19:00:00+08:00')
})

test('targets follow the track and every examiner sits on each panel with a rotating chief', () => {
  const { sessions } = buildGradingSessionPlan(options)
  assert.deepEqual(sessions[0].targets.map(row => row.grade_id), ['blue-6th-kyu', '1st-dan'])
  assert.deepEqual(sessions[1].targets.map(row => row.grade_id), ['blue-6th-kyu', 'red-12th-kyu'])
  assert.deepEqual(sessions.map(row => row.panel.filter(member => member.is_chief).map(member => member.instructor_id)), [['e1'], ['e2'], ['e1']])
  assert.ok(sessions.every(row => row.panel.length === 2 && row.event.instructor_id === row.panel.find(member => member.is_chief).instructor_id))
})

test('ids are stable per date and track, and missing prerequisites stop the seed', () => {
  assert.equal(gradingSessionId('2026-11-14', 'adult'), gradingSessionId('2026-11-14', 'adult'))
  assert.notEqual(gradingSessionId('2026-11-14', 'adult'), gradingSessionId('2026-11-14', 'children'))
  assert.match(gradingSessionId('2026-11-14', 'adult'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.throws(() => buildGradingSessionPlan({ ...options, examiners: [] }), /marked as examiners/)
  assert.throws(() => buildGradingSessionPlan({ ...options, centreId: undefined }), /active centre/)
  assert.throws(() => gradingSessionDates('2026-02-30'), /valid calendar date/)
})

test('candidates are placed by age track and next grade, once each, spread across grades', async () => {
  const { buildCandidatePlan, nextGrade, trackForStudent } = await import('../scripts/seed-grading-sessions.mjs')
  const grades = [{ id: 'blue-6th-kyu', sort_order: 7 }, { id: 'brown-4th-kyu', sort_order: 10 }, { id: '1st-dan', sort_order: 17 },
    { id: 'red-12th-kyu', sort_order: 1 }, { id: 'unranked', sort_order: 0 }]
  const tracks = [{ grade_id: 'blue-6th-kyu', track: 'adult' }, { grade_id: 'brown-4th-kyu', track: 'adult' },
    { grade_id: '1st-dan', track: 'adult' }, { grade_id: 'red-12th-kyu', track: 'children' }, { grade_id: 'blue-6th-kyu', track: 'children' }]
  assert.equal(trackForStudent('2013-12-31', '2026-11-14'), 'adult')
  assert.equal(trackForStudent('2014-01-01', '2026-11-14'), 'children')
  assert.equal(nextGrade('unranked', 'adult', grades, tracks), 'blue-6th-kyu')
  assert.equal(nextGrade('unranked', 'children', grades, tracks), 'red-12th-kyu')
  assert.equal(nextGrade('1st-dan', 'adult', grades, tracks), null)
  const adult = (n, grade) => ({ id: `a${n}`, member_no: String(n).padStart(3, '0'), date_of_birth: '1990-01-01', current_grade_id: grade })
  const students = [
    ...[1, 2, 3, 4].map(n => adult(n, 'unranked')), ...[5, 6].map(n => adult(n, 'blue-6th-kyu')),
    { id: 'kid', member_no: '900', date_of_birth: '2018-01-01', current_grade_id: 'unranked' },
    { id: 'top', member_no: '901', date_of_birth: '1980-01-01', current_grade_id: '1st-dan' },
  ]
  const { sessions } = buildGradingSessionPlan({ ...options, gradeTracks: tracks })
  const plan = buildCandidatePlan({ sessions, students, grades, gradeTracks: tracks, perSession: 4, perGrade: 3 })
  const bySession = id => plan.applications.filter(row => row.grading_event_id === id).map(row => `${row.student_id}:${row.target_grade_id}`)
  // Round-robin across grades: blue first, then brown, then blue again...
  assert.deepEqual(bySession(sessions[0].event.id), ['a1:blue-6th-kyu', 'a5:brown-4th-kyu', 'a2:blue-6th-kyu', 'a6:brown-4th-kyu'])
  assert.deepEqual(bySession(sessions[1].event.id), ['kid:red-12th-kyu'])
  assert.deepEqual(bySession(sessions[2].event.id), ['a3:blue-6th-kyu', 'a4:blue-6th-kyu'])
  assert.equal(new Set(plan.applications.map(row => row.student_id)).size, plan.applications.length)
  assert.ok(!plan.applications.some(row => row.student_id === 'top'))
  assert.deepEqual(plan.roster.map(row => row.student_id), plan.applications.map(row => row.student_id))
})

test('each session takes at most four grades, preferring those with the most eligible students', async () => {
  const { buildCandidatePlan } = await import('../scripts/seed-grading-sessions.mjs')
  const ids = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']
  const grades = [{ id: 'start', sort_order: 0 }, ...ids.map((id, index) => ({ id, sort_order: index + 1 }))]
  const tracks = ids.map(grade_id => ({ grade_id, track: 'adult' }))
  // Two students one grade below g6 and g5, one below each of the others.
  const below = { g1: 'start', g2: 'g1', g3: 'g2', g4: 'g3', g5: 'g4', g6: 'g5' }
  const students = Object.entries({ g1: 1, g2: 1, g3: 1, g4: 1, g5: 2, g6: 2 }).flatMap(([grade, n]) =>
    Array.from({ length: n }, (_, index) => ({ id: `${grade}-${index}`, member_no: `${grade}-${index}`, date_of_birth: '1990-01-01', current_grade_id: below[grade] })))
  const session = { grading: { event_id: 'e', track: 'adult', grading_date: '2026-11-14' }, targets: ids.map(grade_id => ({ grade_id })) }
  const plan = buildCandidatePlan({ sessions: [session], students, grades, gradeTracks: tracks })
  assert.deepEqual([...new Set(plan.applications.map(row => row.target_grade_id))].sort(), ['g1', 'g2', 'g5', 'g6'])
})

test('grade sessions get back-to-back 30-minute slots in grade order and the event spans them', async () => {
  const { scheduleGradeSessions } = await import('../scripts/seed-grading-sessions.mjs')
  const { sessions } = buildGradingSessionPlan(options)
  const [first] = sessions
  const applications = [
    { grading_event_id: first.event.id, target_grade_id: '1st-dan' },
    { grading_event_id: first.event.id, target_grade_id: 'blue-6th-kyu' },
    { grading_event_id: first.event.id, target_grade_id: 'blue-6th-kyu' },
  ]
  const grades = [{ id: 'blue-6th-kyu', sort_order: 7 }, { id: '1st-dan', sort_order: 17 }]
  const [scheduled, untouched] = scheduleGradeSessions(sessions, applications, grades)
  const slot = id => scheduled.targets.find(row => row.grade_id === id)
  assert.equal(Date.parse(slot('blue-6th-kyu').starts_at), Date.parse('2026-11-14T10:00:00+08:00'))
  assert.equal(Date.parse(slot('blue-6th-kyu').ends_at), Date.parse('2026-11-14T10:30:00+08:00'))
  assert.equal(Date.parse(slot('1st-dan').starts_at), Date.parse('2026-11-14T10:30:00+08:00'))
  assert.equal(Date.parse(scheduled.event.ends_at), Date.parse('2026-11-14T11:00:00+08:00'))
  assert.equal(scheduled.event.starts_at, first.event.starts_at)
  // Sessions without candidates keep their original event window and no slots.
  assert.equal(untouched, sessions[1])
})
