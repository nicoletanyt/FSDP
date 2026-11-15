import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

// Load the module with its Supabase client and API helper replaced by stand-ins,
// so the test needs no browser environment or network.
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const calls = []
globalThis.__qrRpc = async (name, args) => {
  calls.push({ name, args })
  return globalThis.__qrReply
}
const supabaseStub = moduleUrl('export const supabase = { rpc: (name, args) => globalThis.__qrRpc(name, args) }')
const apiStub = moduleUrl(`export async function requestInstructorData(operation) {
  const { data, error } = await operation()
  if (error) throw new Error(error.message)
  return data
}`)
const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/instructor/qr-check-in.ts', import.meta.url), 'utf8'))
  .replaceAll("'@/lib/supabase'", JSON.stringify(supabaseStub))
  .replaceAll("'./api'", JSON.stringify(apiStub))
const { checkInWithQr, parseQrCheckIn, qrCheckInFeedback } = await import(moduleUrl(source))

test('scans call check_in_with_qr with the SQL parameter names and a trimmed payload', async () => {
  globalThis.__qrReply = { data: { status: 'marked', already_marked: false, student_name: 'Jess Tan' }, error: null }
  const result = await checkInWithQr('  ASK:ATT:v1:abc  \n', 'event-1')
  assert.deepEqual(calls.at(-1), { name: 'check_in_with_qr', args: { p_payload: 'ASK:ATT:v1:abc', p_event: 'event-1' } })
  assert.deepEqual(result, { status: 'marked', studentName: 'Jess Tan', alreadyMarked: false })
})

test('database errors surface instead of looking like a check-in', async () => {
  globalThis.__qrReply = { data: null, error: { message: 'network down' } }
  await assert.rejects(checkInWithQr('x', 'event-1'), /network down/)
})

test('unknown or malformed replies are treated as an unrecognised code', () => {
  assert.equal(parseQrCheckIn(null).status, 'invalid')
  assert.equal(parseQrCheckIn({ status: 'hacked' }).status, 'invalid')
  assert.equal(parseQrCheckIn({ status: 'marked', student_name: '  ' }).studentName, null)
})

test('each outcome maps to the right scanner message', () => {
  const feedback = (status, extra = {}) => qrCheckInFeedback({ status, studentName: 'Jess Tan', alreadyMarked: false, ...extra })
  assert.deepEqual(feedback('marked'), { tone: 'success', title: 'Jess Tan', description: 'You’re checked in. Welcome to class!' })
  assert.equal(feedback('marked', { alreadyMarked: true }).tone, 'duplicate')
  assert.equal(feedback('excused').tone, 'duplicate')
  for (const status of ['invalid', 'expired', 'wrong_class', 'not_booked', 'cancelled', 'upcoming', 'absent', 'forbidden']) {
    assert.equal(feedback(status).tone, 'invalid', status)
  }
  assert.match(feedback('expired').title, /expired/i)
  assert.match(feedback('not_booked').description, /Jess Tan is not booked/)
  assert.match(qrCheckInFeedback({ status: 'wrong_class', studentName: null, alreadyMarked: false }).description, /This student’s code/)
})
