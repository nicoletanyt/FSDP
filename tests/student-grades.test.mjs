import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { belts, compareRanks, formatRank, getGrade, getGradingSyllabus, getNextGrade, gradingSystems } from '../src/lib/student-grades.ts'
import { eventsForDate, loadSession, resolveInstructorProfile, saveSession, students } from '../src/lib/instructor-calendar.ts'

// Resolve the frontend aliases for these pure mock-data helpers without a browser.
const source = await readFile(new URL('../src/lib/instructor-student-details.ts', import.meta.url), 'utf8')
const output = stripTypeScriptTypes(source
  .replaceAll('"@/lib/instructor-calendar"', JSON.stringify(new URL('../src/lib/instructor-calendar.ts', import.meta.url).href))
  .replaceAll('"@/lib/student-grades"', JSON.stringify(new URL('../src/lib/student-grades.ts', import.meta.url).href)))
const { getStudentProfile, studentGradingHistory, getGradingRequirements, getTechniqueSignOffs, saveTechniqueSignOffs, getExaminerSignature, saveExaminerSignature } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)

test('formal ranks use consistent ordinal and Kyu/Dan formatting', () => {
  for (const [rank, label] of [
    ['1-kyu', '1st Kyu'], ['2-kyu', '2nd Kyu'], ['3-kyu', '3rd Kyu'],
    ['6-kyu', '6th Kyu'], ['10-kyu', '10th Kyu'], ['11-kyu', '11th Kyu'],
    ['12-kyu', '12th Kyu'], ['13-kyu', '13th Kyu'], ['21-kyu', '21st Kyu'],
    ['1-dan', '1st Dan'], ['2-dan', '2nd Dan'],
  ]) assert.equal(formatRank(rank), label)
})

test('belt mappings follow the published syllabus for both grading systems', () => {
  assert.equal(getGrade('children', '10-kyu').belt, 'yellow')
  assert.equal(getGrade('children', '7-kyu').belt, 'purple')
  assert.equal(getGrade('children', '6-kyu').belt, 'blue')
  assert.equal(getGrade('adults', '6-kyu').belt, 'blue')
  assert.equal(getGrade('adults', '5-kyu').belt, 'blue-gold')
})

test('progression supports different ranks sharing a belt and the Kyu-to-Dan boundary', () => {
  assert.deepEqual(getNextGrade('children', '10-kyu'), { rank: '9-kyu', belt: 'orange' })
  assert.deepEqual(getNextGrade('children', '6-kyu'), { rank: '6-kyu-silver', belt: 'blue-silver' })
  assert.equal(getNextGrade('children', '2-kyu-silver'), null)
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

test('every published grade has matching syllabus colours and unique technique IDs', () => {
  const ids = []
  for (const [system, { levels }] of Object.entries(gradingSystems)) {
    const ranks = levels.map(level => level.rank)
    if (system === 'adults') ranks.push('junior-dan')
    for (const rank of ranks) {
      const syllabus = getGradingSyllabus(system, rank)
      assert.ok(syllabus, `${system}: ${rank}`)
      const beltName = syllabus.grade.includes(' Kyu)') ? syllabus.grade.split(' (')[0] : 'Black'
      assert.equal(belts[getGrade(system, rank).belt].label, `${beltName} belt`)
      ids.push(...syllabus.categories.flatMap(category => category.items.map(item => item.id)))
    }
  }
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(getGradingSyllabus('children', '9-kyu').categories[0].items[0].id,
    'children/orange-9th-kyu/attack/shomenuchi')
})

test('relocated grading helpers preserve saved records and isolate students', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } })
  const signOff = {
    itemId: 'children/orange-9th-kyu/attack/shomenuchi',
    signedOffAt: '2026-11-02T10:00:00.000Z',
    signedOffBy: { id: 'instructor-1', name: 'Alex Morgan' },
  }
  try {
    storage.set('instructor-technique-sign-offs-v1:student-1', JSON.stringify([signOff]))
    assert.deepEqual(getTechniqueSignOffs('student-1'), [signOff])
    assert.deepEqual(getTechniqueSignOffs('student-2'), [])
    saveTechniqueSignOffs('student-2', [signOff])
    saveTechniqueSignOffs('student-1', [])
    assert.deepEqual(getTechniqueSignOffs('student-1'), [])
    assert.deepEqual(getTechniqueSignOffs('student-2'), [signOff])
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})

test('sign-off profiles resolve by instructor ID despite renamed or identical display names', () => {
  const signedIn = { id: 'signed-in-id', name: 'Alex Morgan', role: 'Instructor', avatarUrl: '/profile-photo.png' }
  const known = resolveInstructorProfile('instructor-1', 'Outdated display name', signedIn)
  assert.equal(known.id, 'instructor-1')
  assert.equal(known.name, 'Alex Morgan')
  assert.equal(known.avatarUrl, undefined, 'a matching name must not borrow another instructor’s photo')
  assert.deepEqual(resolveInstructorProfile('signed-in-id', 'Old name', signedIn), signedIn)
  const unknown = resolveInstructorProfile('former-instructor', 'Jamie Chen', signedIn)
  assert.equal(unknown.id, 'former-instructor')
  assert.equal(unknown.name, 'Jamie Chen')
  assert.equal(unknown.role, 'Instructor')
  assert.equal(unknown.avatarUrl, undefined)
  assert.equal(resolveInstructorProfile('missing-id').name, 'Unknown instructor')
})

test('eligibility counts only target techniques and leaves missing facts unverified', () => {
  const syllabus = getGradingSyllabus('adults', '2-kyu')
  const requirements = getGradingRequirements({
    syllabus, membershipStatus: 'Active', rankAwardedOn: new Date(2025, 0, 1),
    sessions: [], now: new Date(2026, 10, 2),
    signOffs: [{ itemId: 'children/black-2nd-kyu/ikkyo/ushiro-ryotedori' }],
  })
  assert.equal(requirements.find(item => item.key === 'techniques').actual, '0 of 22')
  for (const key of ['membership-length', 'age', 'fees', 'sessions']) {
    assert.equal(requirements.find(item => item.key === key).met, null)
  }
})

test('examiner signatures preserve strokes and attribution and are scoped to student, track and grade', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } })
  const signature = {
    strokes: [[{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.7 }], [{ x: 0.8, y: 0.3 }]],
    aspectRatio: 3,
    signedAt: '2026-11-02T10:00:00.000Z',
    signedBy: { id: 'instructor-1', name: 'Alex Morgan' },
  }
  try {
    saveExaminerSignature('student-1', 'children', '9-kyu', signature)
    assert.deepEqual(getExaminerSignature('student-1', 'children', '9-kyu'), signature)
    assert.equal(getExaminerSignature('student-2', 'children', '9-kyu'), null)
    assert.equal(getExaminerSignature('student-1', 'adults', '9-kyu'), null)
    assert.equal(getExaminerSignature('student-1', 'children', '8-kyu'), null)
    saveExaminerSignature('student-1', 'children', '8-kyu', signature)
    saveExaminerSignature('student-1', 'children', '9-kyu', null)
    assert.equal(getExaminerSignature('student-1', 'children', '9-kyu'), null)
    assert.deepEqual(getExaminerSignature('student-1', 'children', '8-kyu'), signature)

    const key = 'instructor-examiner-signature-v1:student-1:children:9-kyu'
    for (const malformed of [
      'invalid JSON', '{}', 'null',
      JSON.stringify({ ...signature, strokes: [] }),
      JSON.stringify({ ...signature, strokes: [[{ x: -1, y: 0.2 }]] }),
      JSON.stringify({ ...signature, strokes: [[{ x: 0.5, y: 2 }]] }),
      JSON.stringify({ ...signature, strokes: [[{ x: '0.1', y: 0.2 }]] }),
      JSON.stringify({ ...signature, aspectRatio: 0 }),
      JSON.stringify({ ...signature, signedAt: 'bad date' }),
      JSON.stringify({ ...signature, signedBy: null }),
    ]) {
      storage.set(key, malformed)
      assert.equal(getExaminerSignature('student-1', 'children', '9-kyu'), null)
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})

test('student details loads through Vite without missing grading component imports', async () => {
  const { createServer } = await import('vite')
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const page = await server.ssrLoadModule('/src/pages/Instructor/InstructorStudentDetails.tsx')
    assert.equal(typeof page.default, 'function')
    assert.ok((await server.transformRequest('/src/pages/Instructor/InstructorStudentDetails.tsx'))?.code)
  } finally {
    await server.close()
  }
})
