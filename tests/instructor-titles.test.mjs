import assert from 'node:assert/strict'
import test from 'node:test'
import { allowedTitles, danNumber, isTitleAllowed, titleRequirement } from '../supabase/functions/_shared/instructor-titles.ts'

// Grade ids as stored in public.grades. Black belts below dan must never unlock a title.
const noTitleGrades = [
  'unranked', 'red-12th-kyu', 'red-gold-11th-kyu', 'yellow-10th-kyu', 'orange-9th-kyu', 'green-8th-kyu',
  'purple-7th-kyu', 'blue-6th-kyu', 'blue-silver-6th-kyu', 'blue-gold-5th-kyu', 'brown-4th-kyu',
  'brown-silver-4th-kyu', 'brown-gold-3rd-kyu', 'black-2nd-kyu', 'black-silver-2nd-kyu', 'black-gold-1st-kyu',
  'junior-dan', '1st-dan',
]

test('kyu grades, Junior Dan, 1st dan and missing grades allow only none', () => {
  for (const grade of [...noTitleGrades, null, undefined, '']) {
    assert.deepEqual(allowedTitles(grade), ['none'], String(grade))
  }
})

test('titles unlock at their minimum dan and higher grades keep lower titles', () => {
  assert.deepEqual(allowedTitles('2nd-dan'), ['none', 'fukushidoin'])
  assert.deepEqual(allowedTitles('3rd-dan'), ['none', 'fukushidoin'])
  assert.deepEqual(allowedTitles('4th-dan'), ['none', 'fukushidoin', 'shidoin'])
  assert.deepEqual(allowedTitles('5th-dan'), ['none', 'fukushidoin', 'shidoin'])
  assert.deepEqual(allowedTitles('6th-dan'), ['none', 'fukushidoin', 'shidoin', 'shihan'])
  assert.deepEqual(allowedTitles('8th-dan'), ['none', 'fukushidoin', 'shidoin', 'shihan'])
  assert.equal(isTitleAllowed('3rd-dan', 'shidoin'), false)
  assert.equal(isTitleAllowed('4th-dan', 'shidoin'), true)
})

test('dan is read from the grade id, never from a belt colour or a kyu number', () => {
  assert.equal(danNumber('black-2nd-kyu'), null)
  assert.equal(danNumber('black-gold-1st-kyu'), null)
  assert.equal(danNumber('junior-dan'), null)
  assert.equal(danNumber('black'), null)
  assert.equal(danNumber('2nd-dan'), 2)
  assert.equal(danNumber('11th-dan'), 11)
})

test('requirement hints name the minimum dan', () => {
  assert.equal(titleRequirement('fukushidoin'), 'Requires 2nd dan or above')
  assert.equal(titleRequirement('shidoin'), 'Requires 4th dan or above')
  assert.equal(titleRequirement('shihan'), 'Requires 6th dan or above')
})
