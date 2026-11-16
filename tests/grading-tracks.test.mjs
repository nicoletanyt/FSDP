import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
const fees = moduleUrl(await readFile(new URL('../src/lib/grading-fees.ts', import.meta.url), 'utf8'))
const source = (await readFile(new URL('../src/lib/grading-tracks.ts', import.meta.url), 'utf8')).replace("'./grading-fees'", JSON.stringify(fees))
const { gradingTrackForDob, membershipBeltOptions } = await import(moduleUrl(source))
const ids = ['unranked','red-12th-kyu','red-gold-11th-kyu','yellow-10th-kyu','orange-9th-kyu','green-8th-kyu',
  'purple-7th-kyu','blue-6th-kyu','blue-silver-6th-kyu','blue-gold-5th-kyu','brown-4th-kyu','brown-silver-4th-kyu',
  'brown-gold-3rd-kyu','black-2nd-kyu','black-silver-2nd-kyu','black-gold-1st-kyu','1st-dan']
const catalogue = ids.map(id => ({ id, label: id }))

test('DOB selects the same calendar-year age group as official readiness and checkout', () => {
  assert.equal(gradingTrackForDob('2014-01-01', '2026-11-16'), 'children')
  assert.equal(gradingTrackForDob('2013-12-31', '2026-11-16'), 'adult')
  assert.equal(gradingTrackForDob('2000-01-01', '2026-11-16'), 'adult')
  for (const dob of ['', 'bad', '2026-02-30', '2099-01-01']) assert.equal(gradingTrackForDob(dob, '2026-11-16'), null)
})

test('children see exactly the requested 15 Kyu labels, in order, bound to real IDs', () => {
  const options = membershipBeltOptions(catalogue, 'children')
  assert.deepEqual(options.map(option => option.label), ['12th Kyu (Red)', '11th Kyu (Red Gold)', '10th Kyu (Yellow)',
    '9th Kyu (Orange)', '8th Kyu (Green)', '7th Kyu (Purple)', '6th Kyu (Blue)', '6th Kyu (Blue Silver)',
    '5th Kyu (Blue Gold)', '4th Kyu (Brown)', '4th Kyu (Brown Silver)', '3rd Kyu (Brown Gold)',
    '2nd Kyu (Black)', '2nd Kyu (Black Silver)', '1st Kyu (Black Gold)'])
  assert.deepEqual(options.map(option => option.value), ids.slice(1, 16))
})

test('adults see exactly Beginner and the six adult Kyu ranks; no children-only or Dan options', () => {
  const options = membershipBeltOptions(catalogue, 'adult')
  assert.deepEqual(options.map(option => option.label), ['Unranked (Beginner)', '6th Kyu (Blue)', '5th Kyu (Blue Gold)',
    '4th Kyu (Brown)', '3rd Kyu (Brown Gold)', '2nd Kyu (Black)', '1st Kyu (Black Gold)'])
  assert.equal(options.some(option => option.value === 'blue-silver-6th-kyu'), false)
  assert.equal(options.some(option => option.value === '1st-dan'), false)
  assert.deepEqual(membershipBeltOptions(catalogue, null), [])
})

test('legacy aliases retain database IDs; missing or duplicate definitions are never invented', () => {
  const legacy = catalogue.map(grade => grade.id === 'blue-6th-kyu' ? { ...grade, id: '6-kyu' } : grade)
  assert.equal(membershipBeltOptions(legacy, 'adult')[1].value, '6-kyu')
  assert.throws(() => membershipBeltOptions([], 'adult'), /configure/)
  assert.throws(() => membershipBeltOptions([...legacy, { id: 'blue-6th-kyu', label: 'Duplicate blue' }], 'adult'), /unique catalogue/)
})
