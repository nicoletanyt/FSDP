import assert from 'node:assert/strict'
import test from 'node:test'
import {
  OPTIONS, TEST_STUDENT_EMAILS, fixtureId, parseStart, testClassId, usage, validateArgs,
} from '../scripts/create-test-class.mjs'

test('datetime without an offset is Singapore time', () => {
  assert.equal(parseStart('2026-11-25T18:00').toISOString(), '2026-11-25T10:00:00.000Z')
  assert.equal(parseStart('2026-11-25 18:00:30').toISOString(), '2026-11-25T10:00:30.000Z')
  assert.equal(parseStart('2026-11-25T18:00:00Z').toISOString(), '2026-11-25T18:00:00.000Z')
  assert.throws(() => parseStart('nope'), /not a valid date/)
  assert.throws(() => parseStart(undefined), /required/)
})

test('students and capacity are validated', () => {
  const base = { datetime: '2026-11-25T18:00', students: '3', capacity: '8' }
  const ok = validateArgs(base)
  assert.equal(ok.students, 3)
  assert.equal(ok.capacity, 8)
  assert.equal(ok.endsAt - ok.startsAt, 60 * 60_000)
  assert.equal(validateArgs({ ...base, capacity: undefined }).capacity, 20)
  for (const students of ['0', '4', 'x', undefined]) assert.throws(() => validateArgs({ ...base, students }), /--students/)
  assert.throws(() => validateArgs({ ...base, students: '3', capacity: '2' }), /at least --students/)
  assert.throws(() => validateArgs({ ...base, capacity: '0' }), /--capacity/)
  assert.equal(validateArgs({ datetime: base.datetime, remove: true }).students, 0)
})

test('fixture IDs are stable and distinct', () => {
  assert.match(fixtureId('x'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(testClassId(new Date('2026-11-25T10:00:00Z')), testClassId(new Date('2026-11-25T10:00:00Z')))
  assert.notEqual(testClassId(new Date('2026-11-25T10:00:00Z')), testClassId(new Date('2026-11-25T11:00:00Z')))
  assert.equal(new Set(TEST_STUDENT_EMAILS).size, 3)
  assert.equal(TEST_STUDENT_EMAILS[0], 'jamie.lim@example.test')
})

test('help text lists every option and marks required ones', () => {
  const text = usage()
  for (const option of OPTIONS) assert.ok(text.includes(`--${option.name}`))
  assert.match(text, /--datetime.*REQUIRED/)
  assert.match(text, /--students.*REQUIRED/)
})
