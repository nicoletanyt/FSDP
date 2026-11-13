import assert from 'node:assert/strict'
import test from 'node:test'
import { tokenFromNdefRecords } from '../src/lib/nfc-tag-reader.ts'

const origin = 'https://fsdp-kappa.vercel.app'
const token = 'a'.repeat(64)
const record = (value, recordType = 'url') => ({
  recordType,
  data: new DataView(new TextEncoder().encode(value).buffer),
})

test('reads the token on an existing same-origin URL chip without navigating', () => {
  assert.equal(tokenFromNdefRecords([record(`${origin}/instructor/nfc_checkin?tag=${token.toUpperCase()}`)], origin), token)
})

test('rejects foreign sites, other routes, additional parameters and malformed tokens', () => {
  for (const url of [
    `https://other.example/instructor/nfc_checkin?tag=${token}`,
    `${origin}/instructor/check-in?tag=${token}`,
    `${origin}/instructor/nfc_checkin?tag=${token}&extra=1`,
    `${origin}/instructor/nfc_checkin?tag=${token}#fragment`,
    `${origin}/instructor/nfc_checkin?tag=invalid`,
  ]) assert.equal(tokenFromNdefRecords([record(url)], origin), null)
  assert.equal(tokenFromNdefRecords([record(token, 'text')], origin), null)
  assert.equal(tokenFromNdefRecords([record('bad-url'), record(`${origin}/instructor/nfc_checkin?tag=${token}`)], origin), token)
})
