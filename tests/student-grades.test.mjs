import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { compareRanks, formatRank, getGrade, getNextGrade, gradingSystems } from '../src/lib/student-grades.ts'
import { eventsForDate, loadSession, saveSession, students } from '../src/lib/instructor-calendar.ts'

// Resolve the frontend aliases for these pure mock-data helpers without a browser.
const source = await readFile(new URL('../src/lib/instructor-student-details.ts', import.meta.url), 'utf8')
const output = stripTypeScriptTypes(source
  .replaceAll('"@/lib/instructor-calendar"', JSON.stringify(new URL('../src/lib/instructor-calendar.ts', import.meta.url).href))
  .replaceAll('"@/lib/student-grades"', JSON.stringify(new URL('../src/lib/student-grades.ts', import.meta.url).href)))
const { getStudentProfile, studentGradingHistory } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)

test('formal ranks use consistent ordinal and Kyu/Dan formatting', () => {
  for (const [rank, label] of [
    ['1-kyu', '1st Kyu'], ['2-kyu', '2nd Kyu'], ['3-kyu', '3rd Kyu'],
    ['6-kyu', '6th Kyu'], ['10-kyu', '10th Kyu'], ['11-kyu', '11th Kyu'],
    ['12-kyu', '12th Kyu'], ['13-kyu', '13th Kyu'], ['21-kyu', '21st Kyu'],
    ['1-dan', '1st Dan'], ['2-dan', '2nd Dan'],
  ]) assert.equal(formatRank(rank), label)
})

test('belt mappings depend on the configured grading system, not just the rank', () => {
  assert.equal(getGrade('children', '6-kyu').belt, 'green')
  assert.equal(getGrade('adults', '6-kyu').belt, 'white')
})

test('progression supports different ranks sharing a belt and the Kyu-to-Dan boundary', () => {
  assert.deepEqual(getNextGrade('children', '10-kyu'), { rank: '9-kyu', belt: 'white' })
  assert.deepEqual(getNextGrade('adults', '1-kyu'), { rank: '1-dan', belt: 'black' })
  assert.deepEqual(getNextGrade('adults', '1-dan'), { rank: '2-dan', belt: 'black' })
})

test('unknown and terminal ranks do not invent a belt or a next grading level', () => {
  assert.equal(getGrade('adults', null), null)
  assert.equal(getGrade('adults', '99-kyu'), null)
  assert.equal(getNextGrade('adults', '99-kyu'), null)
  assert.equal(getNextGrade('children', '1-kyu'), null)
  assert.equal(getNextGrade('adults', '5-dan'), null)
})

test('rank ordering decreases Kyu numbers before increasing Dan numbers', () => {
  assert.deepEqual(['2-dan', '1-kyu', '10-kyu', '1-dan', '6-kyu', '4-kyu'].sort(compareRanks),
    ['10-kyu', '6-kyu', '4-kyu', '1-kyu', '1-dan', '2-dan'])
  for (const system of Object.values(gradingSystems)) {
    const ranks = system.levels.map(level => level.rank)
    assert.equal(new Set(ranks).size, ranks.length)
    assert.deepEqual([...ranks].sort(compareRanks), ranks)
  }
})

test('every mock student has a configured formal rank and a derived next rank', () => {
  const today = new Date(2030, 0, 7)
  for (const student of students) {
    assert.ok(getGrade(student.gradingSystem, student.rank), student.name)
    assert.equal(getStudentProfile(student, today).nextRank,
      getNextGrade(student.gradingSystem, student.rank)?.rank ?? null)
  }
  assert.ok(students.some(student => student.gradingSystem === 'children'))
  assert.ok(students.some(student => student.rank.endsWith('-dan')))
})

test('grading history follows system-specific ranks, including Dan history', () => {
  const student = students.find(item => item.id === 'student-12')
  const history = studentGradingHistory(student, new Date(2030, 0, 7))
  assert.ok(history.some(item => item.fromRank === '1-kyu' && item.toRank === '1-dan'))
  for (const item of history) {
    assert.equal(getNextGrade(student.gradingSystem, item.fromRank)?.rank, item.toRank)
  }
})

test('saved technical assessments remain linked to the current and next formal ranks', () => {
  const student = students.find(item => item.id === 'student-6')
  const event = eventsForDate(new Date(2030, 0, 5)).find(item => item.type === 'grading' && item.studentIds.includes(student.id))
  const original = loadSession(event)
  try {
    saveSession(event.id, { ...original, [student.id]: { ...original[student.id], assessmentStatus: 'completed', assessmentNotes: 'Local assessment' } })
    const assessment = studentGradingHistory(student, new Date(2030, 0, 7)).find(item => item.id === event.id)
    assert.equal(assessment.fromRank, '1-kyu')
    assert.equal(assessment.toRank, '1-dan')
    assert.equal(assessment.feedback, 'Local assessment')
    assert.equal(loadSession(event)[student.id].attendance, original[student.id].attendance)
  } finally {
    saveSession(event.id, original)
  }
})
