import assert from 'node:assert/strict'
import test from 'node:test'
import { OPTIONS, usage, validateArgs } from '../scripts/add-membership.mjs'

test('arguments are validated', () => {
  assert.deepEqual(validateArgs({ student: ' Jamie.Lim@example.test ' }), { email: 'jamie.lim@example.test', rank: null, months: 12 })
  assert.deepEqual(validateArgs({ student: 'a@b.co', rank: ' yellow-10th-kyu ', months: '6' }), { email: 'a@b.co', rank: 'yellow-10th-kyu', months: 6 })
  for (const student of ['', 'nope', undefined]) assert.throws(() => validateArgs({ student }), /--student/)
  for (const months of ['0', '121', 'x']) assert.throws(() => validateArgs({ student: 'a@b.co', months }), /--months/)
})

test('help text lists every option and marks the required one', () => {
  const text = usage()
  for (const option of OPTIONS) assert.ok(text.includes(`--${option.name}`))
  assert.match(text, /--student.*REQUIRED/)
})
