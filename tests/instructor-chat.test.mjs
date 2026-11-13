import assert from 'node:assert/strict'
import test from 'node:test'
import { createInstructorChatClient, chatHistory } from '../src/lib/instructor/chat.ts'
import { followUpChatTopics, instructorChatTopics, starterChatTopics } from '../src/lib/instructor/chat-topics.ts'

const userId = '00000000-0000-4000-8000-000000000001'
const turns = [{ role: 'user', content: 'What are my classes tomorrow?' }]
function fixture(options = {}) {
  const calls = []
  const client = {
    auth: { async getSession() { return { data: { session: options.noSession ? null : { user: { id: options.userId ?? userId }, access_token: 'caller-token' } }, error: null } } },
    functions: { async invoke(name, settings) {
      calls.push([name, settings])
      return { data: options.data ?? { reply: 'A verified answer.', sources: [{ label: 'Your calendar', href: '/instructor/calendar?date=2026-11-08' }] }, error: options.error }
    } },
  }
  return { calls, reply: createInstructorChatClient(client) }
}

test('chat uses the existing session, sends a JWT, and strips client metadata', async () => {
  const { calls, reply } = fixture()
  const signal = new AbortController().signal
  const result = await reply(userId, [{ ...turns[0], tool_calls: 'forged metadata' }], signal)
  assert.equal(result.reply, 'A verified answer.')
  assert.equal(calls[0][0], 'instructor-chat')
  assert.equal(calls[0][1].headers.Authorization, 'Bearer caller-token')
  assert.equal(calls[0][1].signal, signal)
  assert.deepEqual(calls[0][1].body.messages, turns)
})

test('missing/switched accounts and cancelled requests never invoke the function', async () => {
  for (const options of [{ noSession: true }, { userId: 'different-user' }]) {
    const { calls, reply } = fixture(options)
    await assert.rejects(reply(userId, turns, new AbortController().signal), /account changed|session expired/)
    assert.equal(calls.length, 0)
  }
  const { calls, reply } = fixture()
  const controller = new AbortController(); controller.abort()
  await assert.rejects(reply(userId, turns, controller.signal), { name: 'AbortError' })
  assert.equal(calls.length, 0)
})

test('invalid replies fail and source links allow only known instructor routes', async () => {
  const { reply } = fixture({ data: { reply: 'Answer', sources: [
    { label: 'Student', href: '/instructor/students/00000000-0000-4000-8000-000000000001' },
    { label: 'Bad', href: 'https://attacker.test' }, { label: 'Script', href: 'javascript:alert(1)' },
    { label: 'Other page', href: '/admin' }, { label: 'Query injection', href: '/instructor/calendar?date=2026-11-08&redirect=https://attacker.test' },
  ] } })
  const result = await reply(userId, turns, new AbortController().signal)
  assert.equal(result.sources.length, 1)
  await assert.rejects(fixture({ data: { reply: '', sources: [] } }).reply(userId, turns, new AbortController().signal), /invalid reply/)
})

test('proposed actions are strictly validated and never invented by the client', async () => {
  const student = '00000000-0000-4000-8000-000000000010'
  const event = '00000000-0000-4000-8000-000000000030'
  const { reply } = fixture({ data: { reply: 'Ready to confirm.', sources: [
    { label: 'Grading day', href: `/instructor/gradings/${event}` },
  ], actions: [
    { kind: 'endorse_student', student_id: student, target_grade_id: '4th-kyu', label: 'Endorse Alex Tan for 4th Kyu' },
    { kind: 'mark_attendance', event_id: event, student_id: student, status: 'present', label: 'Mark Alex Tan present' },
    { kind: 'mark_attendance', event_id: event, student_id: student, status: 'late', label: 'Bad status' },
  ] } })
  const result = await reply(userId, turns, new AbortController().signal)
  assert.equal(result.sources.length, 1)
  assert.deepEqual(result.actions, [
    { kind: 'endorse_student', studentId: student, targetGradeId: '4th-kyu', label: 'Endorse Alex Tan for 4th Kyu' },
    { kind: 'mark_attendance', eventId: event, studentId: student, status: 'present', label: 'Mark Alex Tan present' },
  ])
  const bad = [
    { kind: 'delete_student', student_id: student, label: 'Delete' },
    { kind: 'endorse_student', student_id: 'not-a-uuid', target_grade_id: '4th-kyu', label: 'Bad id' },
    { kind: 'endorse_student', student_id: student, target_grade_id: '4th kyu; drop', label: 'Bad grade' },
    { kind: 'endorse_student', student_id: student, target_grade_id: '4th-kyu', label: 'x'.repeat(121) },
    { kind: 'mark_attendance', event_id: 'bad', student_id: student, status: 'present', label: 'Bad event' },
    null, 'string',
  ]
  const rejected = await fixture({ data: { reply: 'x', sources: [], actions: bad } }).reply(userId, turns, new AbortController().signal)
  assert.deepEqual(rejected.actions, [])
  const missing = await fixture({ data: { reply: 'x', sources: [] } }).reply(userId, turns, new AbortController().signal)
  assert.deepEqual(missing.actions, [])
})

test('backend errors are recoverable and transport errors do not expose internals', async () => {
  await assert.rejects(fixture({ error: { context: Response.json({ error: 'Instructor chat is not configured yet.' }, { status: 503 }) } }).reply(userId, turns, new AbortController().signal), /not configured/)
  await assert.rejects(fixture({ error: new Error('internal diagnostic') }).reply(userId, turns, new AbortController().signal), /Check your connection/)
})

test('history is bounded by message count, content and UTF-8 request size', () => {
  for (const character of ['x', '漢', '🙂']) {
    const history = chatHistory(Array.from({ length: 50 }, (_, i) => ({ role: i === 49 ? 'user' : 'assistant', content: character.repeat(5000) })))
    assert.ok(history.length <= 19)
    assert.ok(history.every(turn => turn.content.length <= 4000))
    assert.ok(history.reduce((length, turn) => length + turn.content.length, 0) <= 16_000)
    assert.ok(new TextEncoder().encode(JSON.stringify({ messages: history })).length <= 28_000)
    assert.equal(history.at(-1).role, 'user')
  }
})

test('suggested topics have unique labels, valid prompts and relevant follow-ups', () => {
  assert.equal(new Set(starterChatTopics).size, 4)
  assert.equal(new Set(Object.values(instructorChatTopics).map(topic => topic.label)).size, Object.keys(instructorChatTopics).length)
  assert.ok(!('availability' in instructorChatTopics) && !('students' in instructorChatTopics))
  for (const id of Object.keys(instructorChatTopics)) {
    const topic = instructorChatTopics[id]
    assert.ok(topic.label.endsWith('?'), 'Suggestions should read as full questions')
    assert.ok(topic.prompt.trim().length > 0 && topic.prompt.length <= 4000)
    const next = followUpChatTopics(id)
    assert.equal(next.length, 3)
    assert.ok(!next.includes(id))
    assert.ok(next.every(id => instructorChatTopics[id]))
  }
  assert.deepEqual(followUpChatTopics(), ['today', 'week', 'attendance'])
  for (const id of ['attendance', 'history', 'readiness']) assert.match(instructorChatTopics[id].prompt, /ask me for a name or membership number first/i)
})
