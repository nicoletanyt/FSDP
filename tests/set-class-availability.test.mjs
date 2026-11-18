import assert from 'node:assert/strict'
import test from 'node:test'
import { OPTIONS, planChange, usage, validateArgs } from '../scripts/set-class-availability.mjs'

const base = { datetime: '2026-11-25T18:00', instructor: ' Coach@Example.test ', 'class-type': 'adults' }

test('arguments are validated', () => {
  const ok = validateArgs(base)
  assert.equal(ok.email, 'coach@example.test')
  assert.equal(ok.classType, 'adults')
  assert.equal(ok.available, false)
  assert.equal(ok.startsAt.toISOString(), '2026-11-25T10:00:00.000Z')
  assert.equal(validateArgs({ ...base, available: true }).available, true)
  assert.throws(() => validateArgs({ ...base, datetime: undefined }), /required/)
  assert.throws(() => validateArgs({ ...base, instructor: 'nope' }), /--instructor/)
  assert.throws(() => validateArgs({ ...base, 'class-type': ' ' }), /--class-type/)
})

test('unavailable: insert, reopen, or leave alone', () => {
  assert.deepEqual(planChange(null, false), { action: 'insert' })
  assert.deepEqual(planChange({ status: 'cancelled' }, false), { action: 'update', status: 'open' })
  assert.equal(planChange({ status: 'open' }, false).action, 'none')
  assert.throws(() => planChange({ status: 'covered' }, false), /covering/)
})

test('available: cancel the open request, or leave alone', () => {
  assert.deepEqual(planChange({ status: 'open' }, true), { action: 'update', status: 'cancelled' })
  assert.equal(planChange(null, true).action, 'none')
  assert.equal(planChange({ status: 'cancelled' }, true).action, 'none')
  assert.throws(() => planChange({ status: 'covered' }, true), /covering/)
})

test('help text lists every option and marks required ones', () => {
  const text = usage()
  for (const option of OPTIONS) assert.ok(text.includes(`--${option.name}`))
  for (const flag of ['datetime', 'instructor', 'class-type']) assert.match(text, new RegExp(`--${flag}.*REQUIRED`))
})
