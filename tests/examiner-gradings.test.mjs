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

async function render(element, sessions, { day = null, path = '/instructor/gradings', checklists = null, syllabus = [] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  const api = { getMyGradingPanels: async () => decodeExaminerSessions(sessions),
    getGradingDay: async () => { if (day instanceof Error) throw day; return decodeGradingDay(day) },
    getSessionChecklists: async () => checklists,
    getReferenceData: async () => ({ centres: [], grades: [], gradeTracks: [], gradeRequirements: [], syllabusItems: syllabus, classTypes: [] }) }
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

test('the gradings list shows each grading\'s application status pill', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())
  const shift = days => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
  const [decoded] = decodeExaminerSessions([row({ application_opens_on: shift(-3), application_deadline: shift(3) })])
  assert.equal(decoded.applicationOpensOn, shift(-3))
  assert.equal(decoded.applicationDeadline, shift(3))
  assert.equal(decodeExaminerSessions([row()])[0].applicationDeadline, null)
  assert.throws(() => decodeExaminerSessions([row({ application_deadline: '10/11/2026' })]), error => error.code === 'invalid_data')
  const pills = async overrides => {
    const root = await render(React.createElement(InstructorGradings), [row({ grading_date: '2999-01-01', ...overrides })])
    return root.root.findAll(node => node.props?.['data-status-pill'] !== undefined && typeof node.type === 'string').map(node => node.props.children)
  }
  assert.deepEqual(await pills({ application_opens_on: shift(-3), application_deadline: shift(3) }), ['Applications open'])
  assert.deepEqual(await pills({ application_opens_on: shift(2), application_deadline: shift(9) }), ['Not open yet'])
  assert.deepEqual(await pills({ application_opens_on: shift(-9), application_deadline: shift(-2) }), ['Closed'])
  assert.deepEqual(await pills({}), [], 'no application window known: no pill rather than a wrong one')
})

test('the gradings page lists the examiner\'s sessions with their panel and a link into grading', async () => {
  const root = await render(React.createElement(InstructorGradings), [row({ grading_date: '2999-01-01' })])
  const text = textOf(root)
  for (const expected of ['Alex Morgan', '"Chief, you"', 'Hiroshi Sato', '3 candidates', 'ASK Headquarters Dojo']) {
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
  assert.deepEqual(labels(false), ['Calendar', 'Students', 'Check-in'])
  assert.deepEqual(labels(true), ['Calendar', 'Students', 'Gradings', 'Check-in'])
  assert.equal(instructorNavigation(true)[2].to, '/instructor/gradings')
})

const grade = (id, label, sort_order) => ({ id, label, colour: 'Blue', is_ranked: true, sort_order })
const blue = grade('blue-6th-kyu', 'Blue (6th Kyu)', 7)
const brown = grade('brown-4th-kyu', 'Brown (4th Kyu)', 10)
const candidate = (student_id, name, member_no, candidate_number, current_grade) =>
  ({ application_id: `app-${student_id}`, student_id, name, member_no, candidate_number, current_grade })
const ada = candidate('s1', 'Ada Tan', '012', 1, { id: 'unranked', label: 'Unranked', colour: null, is_ranked: false, sort_order: 0 })
const ben = candidate('s2', 'Ben Lim', null, 2, null)
const cy = candidate('s3', 'Cy Ong', '044', 3, { id: 'blue-gold-5th-kyu', label: 'Blue-Gold (5th Kyu)', colour: 'Blue-Gold', is_ranked: true, sort_order: 9 })
const sortedSessions = [
  { id: 'session-1', position: 1, starts_at: '2026-11-14T02:00:00Z', ends_at: '2026-11-14T02:30:00Z',
    my_batch: { status: 'draft', version: 2, updated_at: '2026-11-14T03:00:00Z', submitted_at: null },
    grades: [{ grade: blue, candidates: [ada, ben] }] },
  { id: 'session-2', position: 2, starts_at: null, ends_at: null, my_batch: null, grades: [{ grade: brown, candidates: [cy] }] },
]
const sortedStudents = [
  { ...ada, target_grade: blue, session_id: 'session-1' }, { ...ben, target_grade: blue, session_id: 'session-1' },
  { ...cy, target_grade: brown, session_id: 'session-2' },
]
// Before sorting: every applicant, no numbers, no sessions.
const unsortedStudents = sortedStudents.map(student => ({ ...student, candidate_number: null, session_id: null }))
// Far-future grading day so the lifecycle stage doesn't depend on today's date.
const dayRow = (overrides = {}) => ({ ...row(), grading_date: '2999-01-02', application_deadline: '2026-11-10', grading_started: false, is_private: false, published_at: '2026-11-11T00:00:00Z', capacity: 30, warnings: [],
  students: sortedStudents, sessions: sortedSessions, ...overrides })

test('grading days decode every applicant and the sorted sessions with the caller\'s batch', () => {
  const day = decodeGradingDay(dayRow())
  assert.equal(day.name, 'Adult grading — 14 Nov 2026')
  assert.equal(day.applicationDeadline, '2026-11-10')
  assert.equal(day.gradingStarted, false)
  assert.equal(day.sessions.length, 2)
  assert.deepEqual(day.sessions[0].grades[0].candidates[1],
    { applicationId: 'app-s2', studentId: 's2', name: 'Ben Lim', memberNo: null, candidateNumber: 2, currentGrade: null })
  assert.deepEqual(day.students[2].targetGrade, brown)
  assert.equal(day.students[2].sessionId, 'session-2')
  assert.deepEqual(day.students[2].currentGrade, { id: 'blue-gold-5th-kyu', label: 'Blue-Gold (5th Kyu)', colour: 'Blue-Gold', is_ranked: true, sort_order: 9 })
  assert.equal(day.sessions[0].myBatch.status, 'draft')
  assert.equal(day.sessions[1].myBatch, null)
  assert.ok(!('candidates' in day))
  assert.equal(decodeGradingDay(dayRow({ students: unsortedStudents, sessions: [] })).students[0].candidateNumber, null)
  for (const bad of [{ ...dayRow(), sessions: null }, { ...dayRow(), students: undefined },
    dayRow({ sessions: [{ ...sortedSessions[0], my_batch: { status: 'lost' } }] }),
    dayRow({ sessions: [{ ...sortedSessions[0], grades: [{ grade: { id: 'x' }, candidates: [] }] }] }),
    dayRow({ sessions: [{ ...sortedSessions[0], starts_at: null }] }),
    dayRow({ students: [{ ...ada, target_grade: null, session_id: null }] }),
    dayRow({ students: [{ ...ada, current_grade: 'Unranked', target_grade: blue, session_id: null }] }),
    dayRow({ application_deadline: '10/11/2026' })]) {
    assert.throws(() => decodeGradingDay(bad), error => error.code === 'invalid_data')
  }
})

const dayPage = () => React.createElement(Routes, null,
  React.createElement(Route, { path: '/instructor/gradings/:eventId', element: React.createElement(InstructorGradingDay) }))
const dayPath = `/instructor/gradings/${row().event_id}`

const hrefsOf = root => root.root.findAll(node => node.type === 'a').map(node => node.props.href)
const pressed = (root, group) => root.root.find(node => node.props?.role === 'group' && node.props['aria-label'] === group)
  .findAll(node => node.type === 'button').map(node => [node.props.children.at(-1).props.children, node.props['aria-pressed']])

test('once sorted, the grading day opens on the session list with each session\'s students and a checklist link', async () => {
  const root = await render(dayPage(), [], { day: dayRow(), path: dayPath })
  const text = textOf(root)
  assert.deepEqual(pressed(root, 'Grading day list'), [['Student list', false], ['Session list', true]])
  for (const expected of ['Session 1', 'Session 2', 'Ada Tan', 'Ben Lim', 'Cy Ong', 'View checklist',
    'Alex Morgan', '"Chief, you"', '2 candidates', '1 candidate']) {
    assert.ok(text.includes(expected), expected)
  }
  assert.equal(root.root.find(node => node.type === 'h1').props.children, 'Adult grading')
  assert.ok(!text.includes('Chief examiner'))
  // Status shows once, in the footer.
  assert.equal(text.match(/Draft saved/g).length, 1)
  assert.match(text, /Draft saved \d/)
  // A status pill instead of a stepper, the examiners in their own card, and no "Not started" next to "Start grading".
  assert.deepEqual(root.root.findAll(node => node.props?.['data-status-pill'] !== undefined && typeof node.type === 'string').map(node => node.props.children), ['Closed'])
  assert.equal(root.root.findAll(node => node.props?.['data-examiner-panel'] !== undefined && typeof node.type === 'string').length, 1)
  assert.ok(!text.includes('Not started') && !text.includes('Grading progress'))
  // Each session names its grades once; each candidate's current grade is a badge.
  const badges = root.root.findAll(node => node.props?.['data-slot'] === 'grade-badge')
  assert.deepEqual(badges.map(badge => badge.props['data-grade-id']), ['blue-6th-kyu', 'unranked', undefined, 'brown-4th-kyu', 'blue-gold-5th-kyu'])
  assert.ok(text.includes('Grade not recorded'), 'missing grade shows the badge fallback')
  // Single-grade sessions don't repeat the grade on every row.
  assert.ok(!text.includes('Target grade'))
  // The only badge is the status pill.
  assert.equal(root.root.findAll(node => node.props?.['data-slot'] === 'badge' && typeof node.type === 'string').length, 1)
  // Examiners can't sort or move students.
  assert.ok(!text.includes('Sort into sessions') && !text.includes('Sort again') && !text.includes('Move to'))
  const hrefs = hrefsOf(root)
  assert.ok(hrefs.includes('/instructor/grading/session/session-1'))
  assert.ok(hrefs.includes('/instructor/grading/session/session-2'))
  assert.ok(hrefs.includes('/instructor/students/s1'))
  assert.ok(hrefs.includes('/instructor/gradings'))
})

test('each published session has one View checklist link to its checklist page', async () => {
  const checklist = id => `/instructor/grading/session/${id}`
  for (const isChief of [true, false]) {
    const hrefs = hrefsOf(await render(dayPage(), [], { day: dayRow({ is_chief: isChief }), path: dayPath }))
    assert.ok(hrefs.includes(checklist('session-1')) && hrefs.includes(checklist('session-2')))
    assert.ok(!hrefs.some(href => href.includes('?session=') || href.includes('/sessions/')), 'no older checklist URLs')
  }
  const draft = hrefsOf(await render(dayPage(), [], { day: dayRow({ is_chief: false, published_at: null }), path: dayPath }))
  assert.ok(!draft.some(href => href.startsWith('/instructor/grading/session/')), 'nothing to open before the schedule is published')
})

test('a session holding several grades lists each candidate\'s target grade', async () => {
  const mixed = [{ ...sortedSessions[0], grades: [...sortedSessions[0].grades, { grade: brown, candidates: [cy] }] }]
  const text = textOf(await render(dayPage(), [], { day: dayRow({ sessions: mixed }), path: dayPath }))
  assert.ok(text.includes('Target grade'))
  assert.ok(text.includes('Session 1') && !text.includes('Session 2'))
})

test('before sorting, the grading day opens on the student list and explains the empty session list', async () => {
  const before = dayRow({ students: unsortedStudents, sessions: [], application_deadline: '2999-01-01' })
  const root = await render(dayPage(), [], { day: before, path: dayPath })
  let text = textOf(root)
  assert.deepEqual(pressed(root, 'Grading day list'), [['Student list', true], ['Session list', false]])
  for (const expected of ['Ada Tan', 'Ben Lim', 'Cy Ong', 'Current grade']) assert.ok(text.includes(expected), expected)
  // Grouped by target grade; numbers and sessions wait until sorting.
  assert.equal(root.root.findAll(node => node.type === 'tr' && node.props['data-grade-group'] !== undefined).length, 2)
  assert.ok(!text.includes('Not sorted') && !text.includes('"No."'))
  assert.deepEqual(root.root.findAll(node => node.props?.['data-slot'] === 'grade-badge').map(node => node.props['data-grade-id']),
    ['blue-6th-kyu', 'unranked', undefined, 'brown-4th-kyu', 'blue-gold-5th-kyu'])
  assert.ok(text.includes('Applications open'), 'the pill says applications are open')
  await act(async () => { root.root.find(node => node.type === 'button' && node.props.children.at?.(-1)?.props?.children === 'Session list').props.onClick() })
  text = textOf(root)
  assert.ok(text.includes('No sessions yet'))
  assert.ok(!text.includes('Sort into sessions'))
  const closed = textOf(await render(dayPage(), [], { day: dayRow({ students: unsortedStudents, sessions: [] }), path: `${dayPath}?list=sessions` }))
  assert.ok(closed.includes('"Closed"') && closed.includes('No sessions yet'))
})

test('grading days with no applicants, and non-examiners, get clear messages', async () => {
  const empty = textOf(await render(dayPage(), [], { day: dayRow({ students: [], sessions: [] }), path: dayPath }))
  assert.ok(empty.includes('No candidates have applied for this grading yet'))
  const denied = Object.assign(new Error('Only examiners on this grading’s panel can grade it. Ask an administrator to add you to the panel.'), { code: 'forbidden' })
  const blocked = textOf(await render(dayPage(), [], { day: denied, path: dayPath }))
  assert.ok(blocked.includes('Only examiners on this grading'))
  assert.ok(!blocked.includes('Session list'))
})

// The checklist page for one session, reached by the old URL (which redirects) or /instructor/grading/session/:id.
async function renderSession({ path, startsAt = '2026-11-14T02:00:00Z', isChief = true, others = [] } = {}) {
  const { default: InstructorGradingSession, InstructorGradingSessionPage } = await server.ssrLoadModule('/src/pages/Instructor/InstructorGradingSession.tsx')
  const eventId = row().event_id
  const person = (id, first, number) => ({ record: { event_id: eventId, student_id: id, candidate_number: number },
    student: { student: { id, first_name: first, last_name: 'Student', email: `${id}@example.test` } } })
  const session = { event: { id: eventId, name: 'Adult grading — 14 Nov 2026', event_type: 'grading', status: 'scheduled',
    starts_at: '2026-11-14T02:00:00Z', ends_at: '2026-11-14T05:00:00Z', instructor_id: 'i1' },
    centre: { name: 'ASK Headquarters Dojo' }, grading: { track: 'adult' }, targetGrades: [blue, brown] }
  const reference = { grades: [blue, brown], gradeTracks: [{ grade_id: blue.id, track: 'adult' }, { grade_id: brown.id, track: 'adult' }],
    syllabusItems: [{ id: 'b1', grade_id: blue.id, track: 'adult', category: 'Basics', sort_order: 1, label: 'Blue technique' },
      { id: 'r1', grade_id: brown.id, track: 'adult', category: 'Basics', sort_order: 1, label: 'Brown technique' },
      { id: 'x1', grade_id: 'other', track: 'adult', category: 'Basics', sort_order: 1, label: 'Other technique' }] }
  const ann = candidate('s1', 'Ada Student', null, 1, null), cyStudent = candidate('s2', 'Cy Student', null, 2, null)
  const day = decodeGradingDay(dayRow({
    is_chief: isChief,
    panel: [{ instructor_id: 'i1', name: 'Alex Morgan', is_chief: isChief }, { instructor_id: 'i2', name: 'Hiroshi Sato', is_chief: !isChief }],
    students: [{ ...ann, target_grade: blue, session_id: 'mixed' }, { ...cyStudent, target_grade: brown, session_id: 'mixed' }],
    sessions: [{ id: 'mixed', position: 1, starts_at: startsAt, ends_at: '2099-01-01T02:30:00Z', my_batch: null,
      grades: [{ grade: blue, candidates: [ann] }, { grade: brown, candidates: [cyStudent] }] },
    { id: 'other', position: 2, starts_at: '2026-11-14T02:30:00Z', ends_at: '2026-11-14T03:00:00Z', my_batch: null, grades: [] }],
  }))
  const api = {
    getAttendanceRoster: async () => ({ session, entries: [person('s1', 'Ada', 1), person('s2', 'Cy', 2)], canEditAttendance: false }),
    getReferenceData: async () => reference,
    getCurrentInstructor: async () => ({ userId, instructorId: 'i1', name: 'Alex Morgan', email: 'a@example.test' }),
    getLatestGradingBatch: async () => null,
    getGradingBatch: async () => null,
    getGradingDay: async () => day,
    getGradingSessionEvent: async () => eventId,
    getSessionChecklists: async () => ({ viewerId: 'i1', batches: others }),
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const auth = { session: { user: { id: userId } }, profile: { id: userId, role: 'instructor' } }
  globalThis.window ??= { addEventListener() {}, removeEventListener() {} }
  let root
  await act(async () => {
    root = create(React.createElement(QueryClientProvider, { client },
      React.createElement(AuthContext.Provider, { value: auth },
        React.createElement(InstructorApiContext.Provider, { value: api },
          React.createElement(MemoryRouter, { initialEntries: [path ?? `/instructor/grading/${eventId}?session=mixed`] },
            React.createElement(Routes, null,
              React.createElement(Route, { path: '/instructor/grading/session/:sessionId', element: React.createElement(InstructorGradingSessionPage) }),
              React.createElement(Route, { path: '/instructor/grading/:eventId', element: React.createElement(InstructorGradingSession) })))))))
  })
  mounted.push({ root, client })
  for (let attempt = 0; attempt < 30 && !textOf(root).includes('Brown technique'); attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  }
  return { root, eventId }
}
// The A | B | C picker for each technique and candidate.
const markers = root => root.root.findAll(node => node.type === 'div' && node.props.role === 'group' && node.props['data-mark'] !== undefined)
const letterButtons = marker => marker.findAll(node => node.type === 'button')

test('a session checklist has one table per grade, each with only that grade\'s candidates and techniques', async () => {
  // The old /instructor/grading/:eventId?session= URL redirects to /instructor/grading/session/:id.
  const { root, eventId } = await renderSession()
  const text = textOf(root)
  assert.equal(root.root.findAll(node => node.type === 'select').length, 0)
  assert.equal(root.root.find(node => node.type === 'h1').props.children, 'Adult grading')
  // The session is named once, with its grades beside it.
  const sessionBadges = root.root.findAll(node => node.props?.['data-slot'] === 'badge' && typeof node.type === 'string')
  assert.deepEqual(sessionBadges.map(node => node.props.children), ['Session 1'])
  assert.deepEqual(root.root.findAll(node => node.props?.['data-slot'] === 'grade-badge').map(node => node.props['data-grade-id']),
    ['blue-6th-kyu', 'brown-4th-kyu'])
  const tables = root.root.findAll(node => node.props?.role === 'region')
  assert.deepEqual(tables.map(node => node.props['aria-label']), ['Grading checklist: Blue (6th Kyu)', 'Grading checklist: Brown (4th Kyu)'])
  assert.deepEqual(markers(root).map(node => node.props['aria-label']), ['Ada Student: Blue technique', 'Cy Student: Brown technique'])
  assert.deepEqual(letterButtons(markers(root)[0]).map(node => node.props.children), ['A', 'B', 'C'])
  assert.ok(!text.includes('Other technique'))
  assert.equal(root.root.findAll(node => node.type === 'textarea').length, 2)
  assert.ok(root.root.findAll(node => node.type === 'a').some(node => node.props.href === `/instructor/gradings/${eventId}`))
})

test('marking is locked until the session starts, but the checklist is viewable', async () => {
  const early = await renderSession({ path: '/instructor/grading/session/mixed', startsAt: '2099-01-01T02:00:00Z' })
  const text = textOf(early.root)
  assert.ok(text.includes('Marking opens when this session starts'))
  assert.ok(text.includes('Brown technique'), 'the grid is shown')
  assert.ok(markers(early.root).flatMap(letterButtons).every(node => node.props.disabled), 'the letters are disabled')
  assert.ok(early.root.root.findAll(node => node.type === 'textarea').every(node => node.props.disabled))
  assert.ok(!text.includes('Submit grading'))
  const started = await renderSession({ path: '/instructor/grading/session/mixed', startsAt: '2020-01-01T02:00:00Z' })
  assert.ok(!textOf(started.root).includes('Marking opens'))
  assert.ok(markers(started.root).flatMap(letterButtons).some(node => !node.props.disabled), 'marking is open once the session has started')
  assert.ok(textOf(started.root).includes('Submit grading'))
})

test('each technique is marked A, B or C; Submit needs every technique marked', async () => {
  const { root } = await renderSession({ path: '/instructor/grading/session/mixed', startsAt: '2020-01-01T02:00:00Z' })
  const submit = () => root.root.find(node => node.type === 'button' && node.props['data-submit-grading'] !== undefined)
  assert.ok(markers(root).every(node => node.props['data-mark'] === ''), 'cells start blank')
  assert.equal(submit().props.disabled, true)
  assert.ok(textOf(root).includes('2 techniques still need'))
  const choose = async (index, letter) => {
    const button = letterButtons(markers(root)[index]).find(node => node.props.children === letter)
    await act(async () => { button.props.onClick() })
  }
  await choose(0, 'A'); await choose(1, 'C')
  assert.deepEqual(markers(root).map(node => node.props['data-mark']), ['A', 'C'])
  assert.equal(letterButtons(markers(root)[0]).find(node => node.props.children === 'A').props['aria-pressed'], true)
  assert.equal(submit().props.disabled, false, 'every technique is marked')
  assert.ok(!textOf(root).includes('still need'))
  // Choosing the selected letter again clears it.
  await choose(1, 'C')
  assert.equal(markers(root)[1].props['data-mark'], '')
  assert.equal(submit().props.disabled, true)
})

test('the chief can switch to another examiner\'s submitted checklist; other examiners get no picker', async () => {
  const submitted = { instructorId: 'i2', instructorName: 'Hiroshi Sato', sessionId: 'mixed', status: 'submitted',
    updatedAt: '2020-01-01T03:00:00Z', submittedAt: '2020-01-01T03:00:00Z',
    students: [{ student_id: 's1', candidate_number: 1, name: 'Ada Student', notes: 'Hiroshi note', target_grade_id: blue.id }],
    items: [{ syllabus_item_id: 'b1', category: 'Basics', label: 'Blue technique', sort_order: 1, grade_id: blue.id }],
    marks: new Map([[JSON.stringify(['s1', 'b1']), 'B']]) }
  const chief = await renderSession({ path: '/instructor/grading/session/mixed', startsAt: '2020-01-01T02:00:00Z', others: [submitted] })
  const picker = chief.root.root.find(node => node.props?.role === 'group' && node.props['aria-label'] === 'Examiner')
  const buttons = picker.findAll(node => node.type === 'button')
  assert.equal(buttons.length, 2)
  assert.ok(textOf(chief.root).includes('(you)'))
  assert.equal(buttons[0].props['aria-pressed'], true, 'opens on your own, editable checklist')
  assert.ok(markers(chief.root).length > 0 && !textOf(chief.root).includes('Hiroshi note'))
  await act(async () => { buttons[1].props.onClick() })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  const viewing = textOf(chief.root)
  assert.ok(viewing.includes('Hiroshi note'), 'their submitted checklist, read-only')
  assert.deepEqual(chief.root.root.findAll(node => node.type === 'span' && node.props['data-mark'] !== undefined).map(node => node.props['data-mark']), ['B'])
  assert.equal(markers(chief.root).length, 0, 'no editing someone else\'s checklist')
  assert.ok(!viewing.includes('Submit grading'))
  const examiner = await renderSession({ path: '/instructor/grading/session/mixed', startsAt: '2020-01-01T02:00:00Z', isChief: false })
  assert.equal(examiner.root.root.findAll(node => node.props?.role === 'group' && node.props['aria-label'] === 'Examiner').length, 0)
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

test('sessions show their own time with their candidate count, in a single list', async () => {
  const root = await render(dayPage(), [], { day: dayRow(), path: dayPath })
  const text = textOf(root)
  assert.match(text, /10:00.{0,12}–.{0,12}10:30.{0,12}, 2 candidates/)
  assert.ok(text.includes('Time to be confirmed, 1 candidate'), 'untimed session says so')
  assert.equal(root.root.findAll(node => node.props?.role === 'group' && node.props['aria-label'] === 'Grading session layout').length, 0)
  // Member numbers show because some candidates have one; nobody's number is a dash.
  assert.ok(text.includes('Member no.'))
  const empty = textOf(await render(dayPage(), [], { day: dayRow({ sessions: [{ ...sortedSessions[1], grades: [{ grade: brown, candidates: [{ ...cy, member_no: null }] }] }] }), path: dayPath }))
  assert.ok(!empty.includes('Member no.'))
})
