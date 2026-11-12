import assert from 'node:assert/strict'
import test from 'node:test'
import { panelErrorMessage, saveGradingPanel, setExaminer, toPanel } from '../src/lib/admin/grading-panels.ts'

test('panels list the chief first, then members in the order they joined', () => {
  const panel = toPanel([
    { instructor_id: 'b', is_chief: false, added_at: '2026-11-02T00:00:00Z', instructors: { first_name: 'Bea', last_name: 'Two' } },
    { instructor_id: 'c', is_chief: true, added_at: '2026-11-03T00:00:00Z', instructors: [{ first_name: 'Cy', last_name: 'Three' }] },
    { instructor_id: 'a', is_chief: false, added_at: '2026-11-01T00:00:00Z', instructors: null },
  ])
  assert.deepEqual(panel, [
    { instructorId: 'c', isChief: true, name: 'Cy Three' },
    { instructorId: 'a', isChief: false, name: 'Unknown instructor' },
    { instructorId: 'b', isChief: false, name: 'Bea Two' },
  ])
  assert.deepEqual(toPanel(null), [])
})

test('panel database errors become readable messages', () => {
  assert.match(panelErrorMessage({ code: 'PGP02' }, 'x'), /marked as examiners/)
  assert.match(panelErrorMessage({ code: 'PGP03' }, 'x'), /scheduled grading panel/)
  assert.match(panelErrorMessage({ code: 'PGP04' }, 'x'), /chief examiner must be on the panel/)
  assert.match(panelErrorMessage({ code: '42501' }, 'x'), /Only administrators/)
  assert.equal(panelErrorMessage({ code: 'XX000', message: 'internal detail' }, 'fallback'), 'fallback')
})

test('saving a panel calls the atomic RPC and surfaces its errors', async () => {
  const calls = []
  const client = { rpc: async (name, args) => { calls.push([name, args]); return { error: calls.length > 1 ? { code: 'PGP02' } : null } } }
  await saveGradingPanel(client, 'event', ['a', 'b'], 'a')
  assert.deepEqual(calls[0], ['set_grading_panel', { target_event: 'event', examiner_ids: ['a', 'b'], chief_id: 'a' }])
  await assert.rejects(saveGradingPanel(client, 'event', ['x'], null), /marked as examiners/)
})

test('examiner updates must be confirmed by the saved row', async () => {
  const client = row => ({ from: () => ({ update: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => row }) }) }) }) })
  assert.equal(await setExaminer(client({ data: { is_examiner: true }, error: null }), 'i', true), true)
  await assert.rejects(setExaminer(client({ data: null, error: null }), 'i', true), /not saved/)
  await assert.rejects(setExaminer(client({ data: null, error: { code: 'PGP03' } }), 'i', false), /scheduled grading panel/)
})
