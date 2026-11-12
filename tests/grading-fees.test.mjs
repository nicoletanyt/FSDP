import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateGradingFee, feesForTrack, gradingFeeFor, gradingFees, resolveGradingGradeId, singaporeDate } from '../src/lib/grading-fees.ts'

test('all SOP prices are represented, including children intermediate and Dan grades', () => {
  const expected = {
    '12-kyu': 45, '11-kyu': 45, '10-kyu': 45, '9-kyu': 45, '8-kyu': 45, '7-kyu': 45,
    '6-kyu': 50, '6-kyu-silver': 50, '5-kyu': 55, '4-kyu': 60, '4-kyu-silver': 60,
    '3-kyu': 65, '2-kyu': 90, '2-kyu-silver': 90, '1-kyu': 95,
    'junior-dan': 215, '1-dan': 535, '2-dan': 590, '3-dan': 695, '4-dan': 910,
  }
  assert.equal(gradingFees.length, Object.keys(expected).length)
  for (const [id, fee] of Object.entries(expected)) {
    assert.equal(gradingFeeFor(id)?.fee, fee, id)
    assert.equal(calculateGradingFee(id, '2026-11-10', new Date('2026-11-11T00:00:00Z')).total, fee + 22, id)
  }
})

test('adult choices exclude children-only grades; child choices retain the SOP awards', () => {
  assert.ok(!feesForTrack('adult').some((grade) => grade.id === '12-kyu'))
  assert.ok(!feesForTrack('adult').some((grade) => grade.id === '6-kyu-silver'))
  assert.ok(feesForTrack('children').some((grade) => grade.id === '6-kyu-silver'))
  assert.ok(feesForTrack('adult').some((grade) => grade.id === '4-dan'))
})

test('late charge starts only after closing day ends in Singapore', () => {
  const before = new Date('2026-11-29T15:59:59Z')
  const after = new Date('2026-11-29T16:00:00Z')
  assert.equal(singaporeDate(before), '2026-11-29')
  assert.equal(singaporeDate(after), '2026-11-30')
  assert.deepEqual(calculateGradingFee('4-kyu', '2026-11-29', before), { baseFee: 60, lateFee: 0, total: 60, late: false })
  assert.deepEqual(calculateGradingFee('4-kyu', '2026-11-29', after), { baseFee: 60, lateFee: 22, total: 82, late: true })
  assert.equal(calculateGradingFee('4-kyu', undefined, after).lateFee, 0)
  assert.equal(calculateGradingFee('4-kyu', '2026-02-30', after).lateFee, 0)
})

test('legacy rank labels resolve without accepting arbitrary fees or guessing unknown grades', () => {
  assert.equal(resolveGradingGradeId('4th Kyu'), '4-kyu')
  assert.equal(resolveGradingGradeId('Brown-Silver (4th Kyu)'), '4-kyu-silver')
  assert.equal(resolveGradingGradeId('Junior Dan'), 'junior-dan')
  assert.equal(resolveGradingGradeId('2nd Dan'), '2-dan')
  assert.equal(resolveGradingGradeId('Unknown'), null)
  assert.equal(calculateGradingFee('99-kyu'), null)
})
