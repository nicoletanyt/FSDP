import assert from 'node:assert/strict'
import test, { before, after, afterEach } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createServer } from 'vite'
import { api as apiModule, gradingPanels } from './helpers/instructor-modules.mjs'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { decodeExaminerSessions, decodeGradingDay, gradingTitle, groupExaminerSessions } = gradingPanels
const userId = '00000000-0000-4000-8000-000000000001'
const row = (overrides = {}) => ({
  event_id: '00000000-0000-4000-8000-000000000100', name: 'Adult grading — 14 Nov 2026', status: 'scheduled', track: 'adult',
  grading_date: '2026-11-14', starts_at: '2026-11-14T02:00:00+00:00', ends_at: '2026-11-14T05:00:00+00:00', reporting_time: '10:00:00',
  is_chief: true, centre: { name: 'ASK Headquarters Dojo', address: '1 Dojo Road' }, candidates: 3,
  panel: [{ instructor_id: 'a', name: 'Alex Morgan', is_chief: true }, { instructor_id: 'b', name: 'Hiroshi Sato', is_chief: false }],
  ...overrides,
})

test('examiner sessions decode strictly', () => {
  const [session] = decodeExaminerSessions([row()])
  assert.deepEqual(session.panel, [{ instructorId: 'a', name: 'Alex Morgan', isChief: true }, { instructorId: 'b', name: 'Hiroshi Sato', isChief: false }])
  assert.equal(session.isChief, true)
  assert.equal(session.candidates, 3)
  assert.equal(decodeExaminerSessions([row({ starts_at: null, ends_at: null, track: null })])[0].startsAt, null)
  for (const bad of [{}, null, [row({ status: 'draft' })], [row({ grading_date: '14/11/2026' })], [row({ candidates: '3' })],
    [row({ panel: [{ instructor_id: 'a', name: 'A' }] })], [row({ centre: null })], [row({ track: 'teens' })]]) {
    assert.throws(() => decodeExaminerSessions(bad), error => error.code === 'invalid_data')
  }
})

test('upcoming sessions come first; past and cancelled ones are listed most recent first', () => {
  const sessions = decodeExaminerSessions([
    row({ event_id: 'past', grading_date: '2026-11-01', status: 'completed' }),
    row({ event_id: 'old', grading_date: '2026-10-01', status: 'completed' }),
    row({ event_id: 'cancelled', grading_date: '2026-11-20', status: 'cancelled' }),
    row({ event_id: 'today', grading_date: '2026-11-11' }),
    row({ event_id: 'later', grading_date: '2026-11-21' }),
  ].sort((a, b) => a.grading_date.localeCompare(b.grading_date)))
  const { upcoming, past } = groupExaminerSessions(sessions, '2026-11-11')
  assert.deepEqual(upcoming.map(session => session.eventId), ['today', 'later'])
  assert.deepEqual(past.map(session => session.eventId), ['cancelled', 'past', 'old'])
})

test('the API reads my_grading_panels for the signed-in instructor', async () => {
  const calls = []
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from: table => ({ select() { return this }, eq() { return this }, abortSignal() { return this },
      maybeSingle: async () => ({ data: table === 'users' ? { id: userId, role: 'instructor', first_name: 'A', last_name: 'B', email: 'a@example.test' }
        : { id: '00000000-0000-4000-8000-000000000011', user_id: userId, first_name: 'A', last_name: 'B', email: 'a@example.test', created_at: '2026-01-01T00:00:00Z' }, error: null }),
      single: async () => ({ data: { id: userId, role: 'instructor' }, error: null }) }),
    rpc: (name, args) => { calls.push([name, args]); return { returns() { return this }, abortSignal() { return this },
      then: (resolve) => resolve({ data: [row()], error: null }) } },
  }
  const result = await apiModule.createInstructorApi(client).getMyGradingPanels()
  assert.deepEqual(calls, [['my_grading_panels', {}]])
  assert.equal(result[0].name, 'Adult grading — 14 Nov 2026')
})

let server, InstructorGradings, InstructorGradingDay, instructorNavigation, AuthContext, InstructorApiContext
before(async () => {
  server = await createServer({ configFile: false, resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  ;({ default: InstructorGradings } = await server.ssrLoadModule('/src/pages/Instructor/InstructorGradings.tsx'))
  ;({ default: InstructorGradingDay } = await server.ssrLoadModule('/src/pages/Instructor/InstructorGradingDay.tsx'))
  ;({ instructorNavigation } = await server.ssrLoadModule('/src/components/instructor/InstructorNavigation.tsx'))
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ InstructorApiContext } = await server.ssrLoadModule('/src/lib/instructor/data-context.ts'))
})
after(async () => { await server?.close() })

// Query caches hold GC timers; unmount and clear them so the test process exits.
const mounted = []
afterEach(async () => {
  for (const { root, client } of mounted.splice(0)) {
    await act(async () => { root.unmount() })
    client.clear()
  }
})

async function render(element, sessions, { day = null, path = '/instructor/gradings' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  const api = { getMyGradingPanels: async () => decodeExaminerSessions(sessions),
    getGradingDay: async () => { if (day instanceof Error) throw day; return decodeGradingDay(day) } }
  let root
  await act(async () => {
    root = create(React.createElement(QueryClientProvider, { client },
      React.createElement(AuthContext.Provider, { value: auth },
        React.createElement(InstructorApiContext.Provider, { value: api },
          React.createElement(MemoryRouter, { initialEntries: [path] }, element)))))
  })
  mounted.push({ root, client })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  return root
}
const textOf = root => JSON.stringify(root.toJSON())

test('the gradings page lists the examiner\'s sessions with their panel and a link into grading', async () => {
  const root = await render(React.createElement(InstructorGradings), [row({ grading_date: '2999-01-01' })])
  const text = textOf(root)
  for (const expected of ['Alex Morgan', 'Chief (you)', 'Hiroshi Sato', '3 candidates', 'ASK Headquarters Dojo']) {
    assert.ok(text.includes(expected), expected)
  }
  const link = root.root.find(node => node.type === 'a' && node.props.href === `/instructor/gradings/${row().event_id}`)
  assert.equal(link.props.children, 'Adult grading')
  // Each fact once: the date only on the meta line, no track or chief badges.
  assert.ok(!text.includes('14 Nov 2026'), 'event name with its date is not repeated')
  assert.equal(text.match(/2999/g).length, 1)
  assert.ok(!text.includes('Chief examiner'))
  assert.equal(root.root.findAll(node => node.props?.['data-slot'] === 'badge').length, 0)
})

test('instructors on no panel see an explanation instead of sessions', async () => {
  const text = textOf(await render(React.createElement(InstructorGradings), []))
  assert.ok(text.includes('not on any grading panel'))
  assert.ok(!text.includes('Upcoming'))
})

test('the Gradings navigation link appears only for panel members', () => {
  const labels = onPanel => instructorNavigation(onPanel).map(item => item.label)
  assert.deepEqual(labels(false), ['Calendar', 'Students', 'QR Check-in', 'NFC Check-in'])
  assert.deepEqual(labels(true), ['Calendar', 'Students', 'Gradings', 'QR Check-in', 'NFC Check-in'])
  assert.equal(instructorNavigation(true)[2].to, '/instructor/gradings')
})

const grade = (id, label, sort_order) => ({ id, label, colour: 'Blue', is_ranked: true, sort_order })
const dayRow = (overrides = {}) => ({ ...row(), grades: [
  { grade: grade('blue-6th-kyu', 'Blue (6th Kyu)', 7), starts_at: '2026-11-14T02:00:00Z', ends_at: '2026-11-14T02:30:00Z',
    my_batch: { status: 'draft', version: 2, updated_at: '2026-11-14T03:00:00Z', submitted_at: null },
    candidates: [
      { student_id: 's1', name: 'Ada Tan', member_no: '012', candidate_number: 1, current_grade: { id: 'unranked', label: 'Unranked', colour: null, is_ranked: false, sort_order: 0 } },
      { student_id: 's2', name: 'Ben Lim', member_no: null, candidate_number: 2, current_grade: null },
    ] },
  { grade: grade('brown-4th-kyu', 'Brown (4th Kyu)', 10), my_batch: null,
    candidates: [{ student_id: 's3', name: 'Cy Ong', member_no: '044', candidate_number: 3, current_grade: { id: 'blue-gold-5th-kyu', label: 'Blue-Gold (5th Kyu)', colour: 'Blue-Gold', is_ranked: true, sort_order: 9 } }] },
  { grade: grade('1st-dan', '1st Dan', 17), my_batch: null, candidates: [] },
], ...overrides })

test('grading days decode a session per target grade with candidates and the caller\'s batch', () => {
  const day = decodeGradingDay(dayRow())
  assert.equal(day.name, 'Adult grading — 14 Nov 2026')
  assert.equal(day.grades.length, 3)
  assert.deepEqual(day.grades[0].candidates[1], { studentId: 's2', name: 'Ben Lim', memberNo: null, candidateNumber: 2, currentGrade: null })
  assert.deepEqual(day.grades[1].candidates[0].currentGrade, { id: 'blue-gold-5th-kyu', label: 'Blue-Gold (5th Kyu)', colour: 'Blue-Gold', is_ranked: true, sort_order: 9 })
  assert.throws(() => decodeGradingDay(dayRow({ grades: [{ grade: grade('x', 'X', 1), my_batch: null, candidates: [{ student_id: 's', name: 'S', member_no: null, candidate_number: 1, current_grade: 'Unranked' }] }] })), error => error.code === 'invalid_data')
  assert.equal(day.grades[0].myBatch.status, 'draft')
  assert.equal(day.grades[1].myBatch, null)
  assert.ok(!('candidates' in day))
  for (const bad of [{ ...dayRow(), grades: null }, dayRow({ grades: [{ grade: grade('x', 'X', 1), candidates: [], my_batch: { status: 'lost' } }] }),
    dayRow({ grades: [{ grade: { id: 'x' }, candidates: [] }] }), dayRow({ grades: [{ grade: grade('x', 'X', 1), candidates: [{ student_id: 1 }] }] })]) {
    assert.throws(() => decodeGradingDay(bad), error => error.code === 'invalid_data')
  }
})

const dayPage = () => React.createElement(Routes, null,
  React.createElement(Route, { path: '/instructor/gradings/:eventId', element: React.createElement(InstructorGradingDay) }))
const dayPath = `/instructor/gradings/${row().event_id}`

test('the grading day lists one grading session per grade with its students and a checklist link', async () => {
  const root = await render(dayPage(), [], { day: dayRow(), path: dayPath })
  const text = textOf(root)
  for (const expected of ['Blue (6th Kyu)', 'Brown (4th Kyu)', 'Ada Tan', 'Ben Lim', 'Cy Ong', 'Continue grading', 'Start grading',
    '3 candidates', 'Alex Morgan', 'Chief (you)', 'Not started']) {
    assert.ok(text.includes(expected), expected)
  }
  assert.equal(root.root.find(node => node.type === 'h1').props.children, 'Adult grading')
  assert.ok(!text.includes('Chief examiner'))
  // Status shows once, in the footer; grade badges only in the empty-grades list.
  assert.equal(text.match(/Draft saved/g).length, 1)
  assert.match(text, /Draft saved · /)
  // Grades without candidates are not listed at all.
  assert.ok(!text.includes('1st Dan'))
  assert.ok(!text.includes('Target grades with no candidates'))
  // Each candidate's current grade is a grade badge (with a swatch when the belt colour is known).
  const badges = root.root.findAll(node => node.props?.['data-slot'] === 'grade-badge')
  assert.deepEqual(badges.map(badge => badge.props['data-grade-id']), ['unranked', undefined, 'blue-gold-5th-kyu'])
  assert.ok(text.includes('Grade not recorded'), 'missing grade shows the badge fallback')
  assert.ok(text.includes('5th Kyu'))
  assert.equal(root.root.findAll(node => node.props?.['data-slot'] === 'badge').length, 0)
  const hrefs = root.root.findAll(node => node.type === 'a').map(node => node.props.href)
  assert.ok(hrefs.includes(`/instructor/grading/${row().event_id}?grade=blue-6th-kyu`))
  assert.ok(hrefs.includes(`/instructor/grading/${row().event_id}?grade=brown-4th-kyu`))
  assert.ok(!hrefs.includes(`/instructor/grading/${row().event_id}?grade=1st-dan`))
  assert.ok(hrefs.includes('/instructor/students/s1'))
  assert.ok(hrefs.includes('/instructor/gradings'))
})

test('grading days with no applicants, and non-examiners, get clear messages', async () => {
  const empty = textOf(await render(dayPage(), [], { day: dayRow({ grades: [{ grade: grade('1st-dan', '1st Dan', 17), my_batch: null, candidates: [] }] }), path: dayPath }))
  assert.ok(empty.includes('No candidates have applied for this grading yet'))
  const denied = Object.assign(new Error('Only examiners on this grading’s panel can grade it. Ask an administrator to add you to the panel.'), { code: 'forbidden' })
  const blocked = textOf(await render(dayPage(), [], { day: denied, path: dayPath }))
  assert.ok(blocked.includes('Only examiners on this grading'))
  assert.ok(!blocked.includes('Grading sessions'))
})

test('the checklist shows the requested grade and track as badges and lists only that grade\'s candidates', async () => {
  const { default: InstructorGradingSession } = await server.ssrLoadModule('/src/pages/Instructor/InstructorGradingSession.tsx')
  const eventId = row().event_id
  const blue = grade('blue-6th-kyu', 'Blue (6th Kyu)', 7)
  const brown = grade('brown-4th-kyu', 'Brown (4th Kyu)', 10)
  const person = (id, first) => ({ record: { event_id: eventId, student_id: id, candidate_number: id === 's1' ? 1 : 2 },
    student: { student: { id, first_name: first, last_name: 'Student', email: `${id}@example.test` } } })
  const session = { event: { id: eventId, name: 'Adult grading — 14 Nov 2026', event_type: 'grading', status: 'scheduled',
    starts_at: '2026-11-14T02:00:00Z', ends_at: '2026-11-14T05:00:00Z', instructor_id: 'i1' },
    centre: { name: 'ASK Headquarters Dojo' }, grading: { track: 'adult' }, targetGrades: [blue, brown] }
  const reference = { grades: [blue, brown], gradeTracks: [{ grade_id: blue.id, track: 'adult' }, { grade_id: brown.id, track: 'adult' }],
    syllabusItems: [{ id: 'b1', grade_id: blue.id, track: 'adult', category: 'Basics', sort_order: 1, label: 'Blue technique' },
      { id: 'r1', grade_id: brown.id, track: 'adult', category: 'Basics', sort_order: 1, label: 'Brown technique' }] }
  const day = decodeGradingDay({ ...row(), grades: [
    { grade: blue, my_batch: null, candidates: [{ student_id: 's1', name: 'Ada Student', member_no: null, candidate_number: 1, current_grade: null }] },
    { grade: brown, my_batch: null, candidates: [{ student_id: 's2', name: 'Cy Student', member_no: null, candidate_number: 2, current_grade: null }] },
  ] })
  const api = {
    getAttendanceRoster: async () => ({ session, entries: [person('s1', 'Ada'), person('s2', 'Cy')], canEditAttendance: false }),
    getReferenceData: async () => reference,
    getCurrentInstructor: async () => ({ userId, instructorId: 'i1', name: 'Alex Morgan', email: 'a@example.test' }),
    getLatestGradingBatch: async () => null,
    getGradingBatch: async () => null,
    getGradingDay: async () => day,
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  globalThis.window ??= { addEventListener() {}, removeEventListener() {} }
  let root
  await act(async () => {
    root = create(React.createElement(QueryClientProvider, { client },
      React.createElement(AuthContext.Provider, { value: auth },
        React.createElement(InstructorApiContext.Provider, { value: api },
          React.createElement(MemoryRouter, { initialEntries: [`/instructor/grading/${eventId}?grade=brown-4th-kyu`] },
            React.createElement(Routes, null, React.createElement(Route, { path: '/instructor/grading/:eventId', element: React.createElement(InstructorGradingSession) })))))))
  })
  mounted.push({ root, client })
  for (let attempt = 0; attempt < 20 && !textOf(root).includes('Brown technique'); attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  }
  const text = textOf(root)
  // Track and grade are shown as badges, not filters.
  assert.equal(root.root.findAll(node => node.type === 'select').length, 0)
  // The title names the track, so there is no separate track badge, and no date.
  assert.equal(root.root.find(node => node.type === 'h1').props.children, 'Adult grading')
  assert.equal(root.root.findAll(node => node.props?.['data-slot'] === 'badge' && typeof node.type === 'string').length, 0)
  const grades = root.root.findAll(node => node.props?.['data-slot'] === 'grade-badge')
  assert.deepEqual(grades.map(node => node.props['data-grade-id']), ['brown-4th-kyu'])
  assert.ok(text.includes('Brown technique'))
  assert.ok(!text.includes('Blue technique'))
  assert.ok(text.includes('Cy Student'), 'brown candidate listed')
  assert.ok(!text.includes('Ada Student'), 'blue candidate not listed')
  assert.ok(root.root.findAll(node => node.type === 'a').some(node => node.props.href === `/instructor/gradings/${eventId}`))
})

test('grading titles name the track and fall back to the event name', () => {
  assert.equal(gradingTitle({ name: 'Adult grading — 14 Nov 2026', track: 'adult' }), 'Adult grading')
  assert.equal(gradingTitle({ name: "Children's grading — 18 Nov 2026", track: 'children' }), "Children's grading")
  assert.equal(gradingTitle({ name: 'Special dan grading', track: null }), 'Special dan grading')
})

test('completed sessions keep their status badge', async () => {
  const root = await render(React.createElement(InstructorGradings), [row({ status: 'completed', grading_date: '2000-01-01' })])
  const badges = root.root.findAll(node => node.props?.['data-slot'] === 'badge' && typeof node.type === 'string')
  assert.equal(badges.length, 1)
  assert.ok(textOf(root).includes('Completed'))
})

test('grade sessions show their own time, and the list/grid toggle switches the layout', async () => {
  const root = await render(dayPage(), [], { day: dayRow(), path: dayPath })
  const text = textOf(root)
  assert.match(text, /10:00.{0,12}–.{0,12}10:30/)
  assert.ok(text.includes('Time to be confirmed'), 'untimed grade says so')
  const sessions = () => root.root.find(node => node.type === 'section' && node.props['aria-labelledby'] === 'grade-sessions')
  const container = () => sessions().findAll(node => node.type === 'div' && String(node.props.className).startsWith('grid gap-4'))[0]
  const toggle = label => sessions().findAll(node => node.type === 'button' && 'aria-pressed' in node.props)[label === 'List' ? 0 : 1]
  assert.ok(!container().props.className.includes('md:grid-cols-2'))
  assert.equal(toggle('List').props['aria-pressed'], true)
  await act(async () => { toggle('Grid').props.onClick() })
  assert.match(container().props.className, /md:grid-cols-2 xl:grid-cols-3/)
  assert.equal(toggle('Grid').props['aria-pressed'], true)
  // Grid cards are narrower, so they drop the member number column.
  assert.ok(!textOf(root).includes('Member no.'))
  const grid = await render(dayPage(), [], { day: dayRow(), path: `${dayPath}?view=grid` })
  assert.ok(!textOf(grid).includes('Member no.'))
})
