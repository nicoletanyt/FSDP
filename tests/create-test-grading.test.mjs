import assert from 'node:assert/strict'
import test from 'node:test'
import { OPTIONS, buildTestGradingPlan, testGradingId, usage, validateArgs } from '../scripts/create-test-grading.mjs'

const grades = [{ id: 'unranked', sort_order: 0 }, { id: 'white', sort_order: 1 }, { id: 'yellow', sort_order: 2 }]
const gradeTracks = [{ grade_id: 'white', track: 'adult' }, { grade_id: 'yellow', track: 'adult' }, { grade_id: 'white', track: 'children' }]
const student = { id: 's1', email: 'jamie.lim@example.test', date_of_birth: '2001-04-12', current_grade_id: 'unranked' }
const options = { id: 'g1', startsAt: new Date('2026-11-28T02:00:00Z'), endsAt: new Date('2026-11-28T05:00:00Z'),
  centreId: 'c1', chiefId: 'chief', examinerId: 'ex', gradeTracks, grades, students: [student], today: '2026-11-19' }

test('arguments are validated', () => {
  const ok = validateArgs({ datetime: '2026-11-28T10:00', students: '3' })
  assert.equal(ok.students, 3)
  assert.equal(ok.endsAt - ok.startsAt, 180 * 60_000)
  for (const students of ['0', '4', 'x', undefined]) assert.throws(() => validateArgs({ datetime: '2026-11-28T10:00', students }), /--students/)
  assert.throws(() => validateArgs({ students: '1' }), /required/)
  assert.equal(validateArgs({ datetime: '2026-11-28T10:00', remove: true }).students, 0)
})

test('grading ID is stable per start time', () => {
  const a = testGradingId(new Date('2026-11-28T02:00:00Z'))
  assert.equal(a, testGradingId(new Date('2026-11-28T02:00:00Z')))
  assert.notEqual(a, testGradingId(new Date('2026-11-28T03:00:00Z')))
})

test('plan has a chief and an examiner, adult targets and submitted applications', () => {
  const plan = buildTestGradingPlan(options)
  assert.equal(plan.event.instructor_id, 'chief')
  assert.deepEqual(plan.panel.map(row => [row.instructor_id, row.is_chief]), [['chief', true], ['ex', false]])
  assert.deepEqual(plan.targets.map(row => row.grade_id), ['white', 'yellow'])
  assert.equal(plan.grading.grading_date, '2026-11-28')
  assert.equal(plan.grading.reporting_time, '10:00:00')
  assert.equal(plan.grading.application_deadline, '2026-11-27')
  assert.deepEqual(plan.applications, [{ student_id: 's1', grading_event_id: 'g1', target_grade_id: 'white', status: 'submitted' }])
  assert.deepEqual(plan.roster, [{ event_id: 'g1', student_id: 's1' }])
})

test('children cannot apply to the adult grading', () => {
  assert.throws(() => buildTestGradingPlan({ ...options, students: [{ ...student, date_of_birth: '2018-01-01' }] }), /not an adult/)
})

test('help text lists every option and marks required ones', () => {
  const text = usage()
  for (const option of OPTIONS) assert.ok(text.includes(`--${option.name}`))
  assert.match(text, /--datetime.*REQUIRED/)
  assert.match(text, /--students.*REQUIRED/)
})
