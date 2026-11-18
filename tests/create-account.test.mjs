import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_PASSWORD, OPTIONS, usage, validateArgs } from '../scripts/create-account.mjs'

test('defaults need only a username', () => {
  assert.deepEqual(validateArgs({ username: ' Sam ' }), { email: 'sam@example.test', password: DEFAULT_PASSWORD, role: 'student',
    firstName: 'Sam', lastName: 'Test', isExaminer: false, employmentType: null })
  assert.equal(validateArgs({ username: 'a@b.co' }).email, 'a@b.co')
  assert.deepEqual(['Jo Ann Lee'].map(name => validateArgs({ username: 'x', name })).map(a => [a.firstName, a.lastName]), [['Jo', 'Ann Lee']])
})

test('instructor flags', () => {
  const base = { username: 'coach', role: 'instructor' }
  assert.equal(validateArgs({ ...base, examiner: true }).isExaminer, true)
  assert.equal(validateArgs({ ...base, 'chief-examiner': true }).isExaminer, true)
  assert.equal(validateArgs({ ...base, 'part-time': true }).employmentType, 'part_time')
  assert.equal(validateArgs({ ...base, 'full-time': true }).employmentType, 'full_time')
  assert.equal(validateArgs(base).employmentType, null)
  assert.throws(() => validateArgs({ ...base, 'part-time': true, 'full-time': true }), /not both/)
  assert.throws(() => validateArgs({ username: 'x', examiner: true }), /only applies to --role instructor/)
  assert.throws(() => validateArgs({ username: 'x', role: 'administrator', 'full-time': true }), /only applies/)
})

test('invalid input is rejected', () => {
  assert.throws(() => validateArgs({}), /--username/)
  assert.throws(() => validateArgs({ username: 'bad name' }), /--username/)
  assert.throws(() => validateArgs({ username: 'x', role: 'boss' }), /--role/)
  for (const password of ['short1', 'allletters', '12345678']) assert.throws(() => validateArgs({ username: 'x', password }), /--password/)
})

test('help text lists every option and marks the required one', () => {
  const text = usage()
  for (const option of OPTIONS) assert.ok(text.includes(`--${option.name}`))
  assert.match(text, /--username.*REQUIRED/)
})
