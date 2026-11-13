import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { stripTypeScriptTypes } from 'node:module'

const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const fees = moduleUrl(await readFile(new URL('../src/lib/grading-fees.ts', import.meta.url), 'utf8'))
const source = await readFile(new URL('../src/lib/grading-progression.ts', import.meta.url), 'utf8')
const { gradingProgression } = await import(moduleUrl(source.replace("'./grading-fees'", JSON.stringify(fees))))

const grades = [
  { id: 'unranked', label: 'Unranked', sort_order: 0 },
  { id: 'red', label: 'Red (12th Kyu)', sort_order: 1 },
  { id: 'blue', label: 'Blue (6th Kyu)', sort_order: 7 },
  { id: 'blue-silver', label: 'Blue-Silver (6th Kyu)', sort_order: 8 },
  { id: 'blue-gold', label: 'Blue-Gold (5th Kyu)', sort_order: 9 },
  { id: 'brown', label: 'Brown (4th Kyu)', sort_order: 10 },
]
const tracks = [
  ...['blue', 'blue-gold', 'brown'].map((grade_id) => ({ grade_id, track: 'adult' })),
  ...['red', 'blue', 'blue-silver', 'blue-gold', 'brown'].map((grade_id) => ({ grade_id, track: 'children' })),
]
const requirements = tracks.map((entry) => ({ ...entry, fee_cents: entry.grade_id === 'blue-gold' ? 5500 : 5000 }))
const progression = (rank, birth = '2000-01-01', fees = requirements) => gradingProgression(
  { current_grade_id: rank, date_of_birth: birth }, [...grades].reverse(), tracks, fees, '2026-11-13',
)

test('adult blue can only advance to blue-gold with its database price', () => {
  const result = progression('blue')
  assert.equal(result.current.label, 'Blue (6th Kyu)')
  assert.equal(result.target.id, 'blue-gold')
  assert.equal(result.feeCents, 5500)
  assert.equal(progression('blue-gold').target.id, 'brown')
})

test('children and calendar-year age transitions follow their database track', () => {
  assert.equal(progression('blue', '2020-01-01').target.id, 'blue-silver')
  assert.equal(progression('blue', '2013-12-31').target.id, 'blue-gold')
})

test('unranked starts at the first grade for the applicable track', () => {
  assert.equal(progression('unranked').target.id, 'blue')
  assert.equal(progression('unranked', '2020-01-01').target.id, 'red')
})

test('last grade has no target; unknown ranks and invalid birth dates are not guessed', () => {
  assert.equal(progression('brown').target, null)
  assert.throws(() => progression('missing'), /current rank is missing/)
  assert.throws(() => progression('blue', ''), /date of birth/)
  assert.throws(() => progression('blue', '2099-01-01'), /date of birth/)
})

test('missing fees are not silently presented as free', () => {
  assert.equal(progression('blue', '2000-01-01', []).feeCents, null)
})
