import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanChatReply } from '../supabase/functions/_shared/chat-output.ts'

const answer = '**11:00 am–12:00 pm**\nChildren Juniors — Sunday\nCentral Dojo · Class'

test('removes the reported Source footer, including Unicode spaces and Markdown styles', () => {
  for (const footer of [
    'Source: get_my_schedule (from\u202f2026-11-08\u202fto\u202f2026-11-09, 1 record returned, no further pages).',
    '*Source: get_my_schedule (1 record returned).*', '**Source:** get_my_schedule',
    '**Source**: get_my_schedule', '> Source: get_my_schedule', '- Source: get_my_schedule',
    'Sources: instructor calendar query\nfrom 2026-11-08 to 2026-11-09.',
  ]) assert.equal(cleanChatReply(`${answer}\n\n${footer}`), answer)
})

test('removes source sections and inline tool metadata without losing the answer', () => {
  assert.equal(cleanChatReply(`${answer}\n\n## Sources\n\n- get_my_schedule\n\n- get_my_availability`), answer)
  assert.equal(cleanChatReply(`${answer} Source: get_my_schedule (1 record).`), answer)
  assert.equal(cleanChatReply(`${answer}\n**Source:** get_my_schedule (1 record).`), answer)
})

test('preserves useful warnings, counts, ordinary source wording, and code examples', () => {
  const caveat = 'Showing 20 of 30 students. More results are available.'
  assert.equal(cleanChatReply(`${answer}\n\nSource: get_my_schedule\n\n${caveat}`), `${answer}\n\n${caveat}`)
  for (const content of [answer, caveat, 'I could not read your schedule. Please retry.', 'Your source of attendance data is incomplete.', 'Sources of confusion can be discussed with your instructor.', '```text\nSource: example\n```']) assert.equal(cleanChatReply(content), content)
})

test('a source-only answer is empty rather than leaking technical details', () => {
  assert.equal(cleanChatReply('Source: get_my_schedule (1 record returned).'), '')
})
