import assert from 'node:assert/strict'
import test from 'node:test'
import { OPTIONS, accountBalance, usage, validateArgs } from '../scripts/add-credits.mjs'

test('arguments are validated', () => {
  const ok = validateArgs({ student: ' Jamie.Lim@example.test ', amount: '10' })
  assert.deepEqual(ok, { email: 'jamie.lim@example.test', amount: 10, expiresAt: null })
  for (const amount of ['0', '1001', '-1', 'x', '1.5', undefined]) assert.throws(() => validateArgs({ student: 'a@b.co', amount }), /--amount/)
  for (const student of ['', 'nope', undefined]) assert.throws(() => validateArgs({ student, amount: '1' }), /--student/)
  assert.equal(validateArgs({ student: 'a@b.co', amount: '1', expires: '2999-12-31' }).expiresAt, '2999-12-31T15:59:59.000Z')
  assert.throws(() => validateArgs({ student: 'a@b.co', amount: '1', expires: '2000-01-01' }), /future/)
  assert.throws(() => validateArgs({ student: 'a@b.co', amount: '1', expires: 'soon' }), /--expires/)
})

test('balance ignores expired and unlimited batches like sync_account', () => {
  const now = new Date('2026-11-19T00:00:00Z')
  const batches = [
    { credits_remaining: 4, unlimited: false, expires_at: 'infinity' },
    { credits_remaining: 3, unlimited: false, expires_at: '2027-01-01T00:00:00Z' },
    { credits_remaining: 9, unlimited: false, expires_at: '2026-01-01T00:00:00Z' },
    { credits_remaining: 0, unlimited: true, expires_at: '2027-01-01T00:00:00Z' },
  ]
  assert.deepEqual(accountBalance(batches, now), { credits: 7, unlimited: true })
  assert.deepEqual(accountBalance([], now), { credits: 0, unlimited: false })
})

test('help text lists every option and marks required ones', () => {
  const text = usage()
  for (const option of OPTIONS) assert.ok(text.includes(`--${option.name}`))
  assert.match(text, /--student.*REQUIRED/)
  assert.match(text, /--amount.*REQUIRED/)
})
