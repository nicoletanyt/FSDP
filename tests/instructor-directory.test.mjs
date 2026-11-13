import assert from 'node:assert/strict'
import test from 'node:test'
import { directory } from './helpers/instructor-modules.mjs'

const { DIRECTORY_PAGE_SIZE, directoryPage, directoryOptions, changeDirectoryFilter, clearDirectoryFilters, directoryTrack, directoryStudent,
  loadDirectorySnapshot, filterDirectorySnapshot } = directory
const centreId = '00000000-0000-4000-8000-000000000010'

test('directory URL values map to actual database filters and bounded pagination', () => {
  const params = new URLSearchParams({ q: 'ASK-%_001', rank: 'database-grade-key', belt: 'Blue-Gold', dojo: centreId, page: '3', context: 'keep' })
  assert.deepEqual(directoryOptions(params), { search: 'ASK-%_001', gradeId: 'database-grade-key', colour: 'Blue-Gold', centreId,
    offset: 2 * DIRECTORY_PAGE_SIZE, limit: DIRECTORY_PAGE_SIZE })
  for (const value of ['0', '-1', '1.5', 'abc', '999999999999999999', '42949673']) {
    assert.equal(directoryPage(new URLSearchParams({ page: value })), 1)
  }
  assert.throws(() => directoryOptions(new URLSearchParams({ dojo: 'Northside Dojo' })), { code: 'invalid_data' })
})

test('changing or clearing filters resets pagination and preserves unrelated URL state', () => {
  const initial = new URLSearchParams('context=keep&sort=name&q=Member&rank=grade&belt=Green&dojo=centre&page=4')
  const changed = changeDirectoryFilter(initial, 'rank', 'unranked')
  assert.equal(changed.get('rank'), 'unranked')
  assert.equal(changed.has('page'), false)
  assert.equal(initial.get('page'), '4')
  const reset = clearDirectoryFilters(initial, false)
  assert.deepEqual(Object.fromEntries(reset), { context: 'keep', sort: 'name', q: 'Member' })
  assert.deepEqual(Object.fromEntries(clearDirectoryFilters(initial, true)), { context: 'keep', sort: 'name' })
})

test('grading track uses Singapore calendar-year age, including the year a student turns thirteen', () => {
  assert.equal(directoryTrack('2014-12-31', '2026-01-01'), 'children')
  assert.equal(directoryTrack('2013-12-31', '2026-01-01'), 'adult')
  assert.equal(directoryTrack('2014-12-31', '2027-01-01'), 'adult')
  assert.equal(directoryTrack('2027-01-01', '2026-12-31'), null)
})

test('directory projections retain member numbers, database grade labels and missing centre/grade facts', () => {
  const entry = { student: { id: 'actual-student-id', first_name: '  New ', last_name: ' Student  ', email: 'member@example.test', member_no: 'ASK-500', date_of_birth: '2000-12-31' },
    grade: { id: 'unranked', label: 'Unranked', colour: null, is_ranked: false, sort_order: 0 }, centre: null }
  const result = directoryStudent(entry, '2026-11-05')
  assert.equal(result.id, entry.student.id)
  assert.equal(result.memberNo, 'ASK-500')
  assert.equal(result.name, 'New Student')
  assert.equal(result.grade.label, 'Unranked')
  assert.equal(result.principalDojo, 'Dojo not recorded')
  assert.equal(result.trackLabel, "Adults' grading")
  // Born 31 Dec 2000: still 25 on 5 Nov 2026 (birthday-based), though 26 by year.
  assert.equal(result.age, 25)
  assert.equal(directory.studentAge('2000-11-05', '2026-11-05'), 26)
  assert.equal(directory.studentAge('2000-11-06', '2026-11-05'), 25)
  assert.equal(directory.studentAge('2027-01-01', '2026-11-05'), null)
  const missing = directoryStudent({ ...entry, grade: null }, '2026-11-05')
  assert.equal(missing.grade, null)
  assert.equal(directoryStudent({ ...entry, student: { ...entry.student, first_name: '', last_name: '' } }, '2026-11-05').name, entry.student.email)
})

const fixtures = Array.from({ length: 205 }, (_, index) => ({
  student: { id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, first_name: `Member ${index}`, last_name: 'Student',
    member_no: index === 0 ? 'ASK-%_001' : `ASK-${index}`, current_grade_id: index % 2 ? 'blue' : 'unranked', home_centre_id: centreId },
  grade: { id: index % 2 ? 'blue' : 'unranked', colour: index % 2 ? 'Blue' : null }, centre: { id: centreId },
}))
const facets = { grades: [{ id: 'blue', label: 'Published blue' }], colours: ['Blue'], centres: [{ id: centreId, name: 'Published dojo' }] }
const response = (offset, items, total = fixtures.length) => ({ items, total, scopeTotal: total, offset, limit: 100, facets })

test('a directory snapshot loads every unfiltered page even when the server caps page lengths', async () => {
  const requests = []
  const signal = new AbortController().signal
  const snapshot = await loadDirectorySnapshot(async options => {
    requests.push(options)
    return response(options.offset, fixtures.slice(options.offset, options.offset + 40))
  }, signal)
  assert.equal(snapshot.items.length, 205)
  assert.deepEqual(requests.map(options => options.offset), [0, 40, 80, 120, 160, 200])
  assert.ok(requests.every(options => options.limit === 100 && options.signal === signal
    && options.search === undefined && options.gradeId === undefined && options.colour === undefined && options.centreId === undefined))
  assert.equal(snapshot.facets, facets)
})

test('local filters and pagination preserve the immutable snapshot, global totals and complete facets', () => {
  const snapshot = { items: fixtures, facets }
  const ids = fixtures.map(entry => entry.student.id)
  const second = filterDirectorySnapshot(snapshot, new URLSearchParams({ page: '2' }))
  assert.equal(second.items.length, 50)
  assert.equal(second.items[0].student.id, fixtures[50].student.id)
  assert.equal(second.total, 205)
  assert.equal(second.scopeTotal, 205)
  assert.equal(second.facets, facets)
  const filtered = filterDirectorySnapshot(snapshot, new URLSearchParams({ rank: 'blue', belt: 'Blue', dojo: centreId }))
  assert.equal(filtered.total, 102)
  assert.equal(filtered.scopeTotal, 205)
  assert.equal(filtered.facets, facets)
  const literal = filterDirectorySnapshot(snapshot, new URLSearchParams({ q: 'ask-%_' }))
  assert.equal(literal.total, 1)
  assert.equal(literal.items[0], fixtures[0])
  assert.equal(filterDirectorySnapshot(snapshot, new URLSearchParams({ q: 'MEMBER 204' })).items[0], fixtures[204])
  assert.deepEqual(fixtures.map(entry => entry.student.id), ids)
  assert.throws(() => filterDirectorySnapshot(snapshot, new URLSearchParams({ q: 'x'.repeat(201) })), { code: 'invalid_request' })
})

test('incomplete, duplicate or changing snapshot pages fail rather than become a partial cached directory', async () => {
  const signal = new AbortController().signal
  for (const read of [
    async ({ offset }) => response(offset, offset ? [] : [fixtures[0]], 2),
    async ({ offset }) => response(offset, [fixtures[0]], 2),
    async ({ offset }) => response(offset, [fixtures[offset]], offset ? 3 : 2),
    async ({ offset }) => ({ ...response(offset, [fixtures[offset]], 2), facets: offset ? { ...facets, colours: ['Changed'] } : facets }),
  ]) await assert.rejects(loadDirectorySnapshot(read, signal), { code: 'request_failed' })
  let count = 0
  await assert.rejects(loadDirectorySnapshot(async ({ offset }) => {
    count++
    if (offset) throw new Error('Second page failed')
    return response(0, fixtures.slice(0, 100))
  }, signal), /Second page failed/)
  assert.equal(count, 2)
  const empty = await loadDirectorySnapshot(async () => response(0, [], 0), signal)
  assert.deepEqual(empty.items, [])
  const aborted = new AbortController()
  aborted.abort()
  await assert.rejects(loadDirectorySnapshot(async () => assert.fail('Cancelled request must not run'), aborted.signal), { name: 'AbortError' })
})
