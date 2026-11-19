import assert from 'node:assert/strict'
import test from 'node:test'
import { tokenFromNdefRecords } from '../src/lib/nfc-tag-reader.ts'

const origin = 'https://fsdp-kappa.vercel.app'
const token = 'a'.repeat(64)
const record = (value, recordType = 'url', encoding) => ({
  recordType,
  encoding,
  data: new DataView(new TextEncoder().encode(value).buffer),
})

test('reads exact NDEF text tokens without an origin or a URL', () => {
  assert.equal(tokenFromNdefRecords([record(token.toUpperCase(), 'text')], origin), token)
  assert.equal(tokenFromNdefRecords([record('unrelated', 'text'), record(token, 'text')], origin), token)
  assert.equal(tokenFromNdefRecords([{
    recordType: 'text', encoding: 'utf-16le',
    data: new DataView(Uint8Array.from(token.split('').flatMap(char => [char.charCodeAt(0), 0])).buffer),
  }], origin), token)
})

test('rejects malformed text, unsupported records and invalid encoding', () => {
  for (const value of [token.slice(1), ` ${token}`, `${token}\n`, `https://example.test/${token}`, 'g'.repeat(64)]) {
    assert.equal(tokenFromNdefRecords([record(value, 'text')], origin), null)
  }
  assert.equal(tokenFromNdefRecords([record(token, 'mime')], origin), null)
  assert.equal(tokenFromNdefRecords([{ recordType: 'text', data: null }], origin), null)
  assert.equal(tokenFromNdefRecords([{ recordType: 'text', data: new DataView(Uint8Array.of(0xff).buffer) }], origin), null)
  assert.equal(tokenFromNdefRecords([record(token, 'text', 'invalid-encoding')], origin), null)
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
  assert.equal(tokenFromNdefRecords([record(token, 'url')], origin), null)
  assert.equal(tokenFromNdefRecords([record('bad-url'), record(`${origin}/instructor/nfc_checkin?tag=${token}`)], origin), token)
})
