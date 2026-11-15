import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/instructor/nfc-feedback.ts', import.meta.url), 'utf8'))
const { nfcCheckInFeedback: feedback } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('NFC successes and duplicates use QR-style scanner feedback', () => {
  const result = { status: 'marked', student_name: 'Test student', class_name: 'Practice', event_id: 'class-1' }
  assert.deepEqual(feedback(result), {
    tone: 'success', title: 'Test student', description: 'You’re checked in for Practice. Welcome to class!',
  })
  assert.deepEqual(feedback({ ...result, already_marked: true }), {
    tone: 'duplicate', title: 'Already checked in', description: 'Test student is already on the attendance list for Practice.',
  })
})

test('NFC non-marking outcomes never imply attendance was recorded', () => {
  for (const status of ['upcoming', 'absent', 'no_class', 'wrong_class', 'forbidden', 'unlinked', 'invalid']) {
    assert.equal(feedback({ status, student_name: 'Test student' }).tone, 'invalid', status)
  }
  assert.equal(feedback({ status: 'excused' }).tone, 'duplicate')
  assert.match(feedback({ status: 'no_class', student_name: 'Test student' }).description, /Test student/)
  assert.match(feedback({ status: 'absent' }).description, /No attendance was changed/)
  assert.doesNotMatch(JSON.stringify(feedback({ status: 'invalid' })), /tag=/)
})
