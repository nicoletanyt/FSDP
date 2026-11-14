import assert from 'node:assert/strict'
import test, { before, after, afterEach } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
// The move menu's trigger looks up its document in an effect; the renderer has none.
globalThis.document ??= { addEventListener() {}, removeEventListener() {} }
const eventId = '00000000-0000-4000-8000-000000000100'
const grade = (id, label, sort_order) => ({ id, label, colour: 'Blue', is_ranked: true, sort_order })
const blue = grade('blue-6th-kyu', 'Blue (6th Kyu)', 7)
const brown = grade('brown-4th-kyu', 'Brown (4th Kyu)', 10)
const candidate = (student_id, name, member_no, candidate_number) =>
  ({ application_id: `app-${student_id}`, student_id, name, member_no, candidate_number, current_grade: null })
const [ada, ben, cy] = [candidate('s1', 'Ada Tan', '012', 1), candidate('s2', 'Ben Lim', null, 2), candidate('s3', 'Cy Ong', '044', 3)]
const base = {
  event_id: eventId, name: 'Adult grading — 14 Nov 2026', status: 'scheduled', track: 'adult', grading_date: '2999-01-02',
  starts_at: '2026-11-14T02:00:00+00:00', ends_at: '2026-11-14T05:00:00+00:00', reporting_time: null, is_chief: false,
  application_deadline: '2026-11-10', grading_started: false, is_private: false, published_at: '2026-11-11T00:00:00Z', capacity: 30, warnings: [],
  centre: { name: 'ASK Headquarters Dojo', address: '1 Dojo Road' },
  panel: [{ instructor_id: 'a', name: 'Alex Morgan', is_chief: true }, { instructor_id: 'b', name: 'Hiroshi Sato', is_chief: false }],
}
// Session 1 holds both grades (Cy was moved in); session 2 is Brown only.
const day = {
  ...base,
  students: [{ ...ada, target_grade: blue, session_id: 'session-1' }, { ...ben, target_grade: blue, session_id: 'session-1' },
    { ...cy, target_grade: brown, session_id: 'session-1' }],
  sessions: [
    { id: 'session-1', position: 1, starts_at: '2026-11-14T02:00:00Z', ends_at: '2026-11-14T02:30:00Z', my_batch: null,
      grades: [{ grade: blue, candidates: [ada, ben] }, { grade: brown, candidates: [cy] }] },
    { id: 'session-2', position: 2, starts_at: '2026-11-14T02:30:00Z', ends_at: '2026-11-14T03:00:00Z', my_batch: null,
      grades: [{ grade: brown, candidates: [] }] },
  ],
}
const unsorted = { ...base, students: day.students.map(row => ({ ...row, candidate_number: null, session_id: null })), sessions: [] }
const person = (first_name, last_name) => ({ first_name, last_name })
const batches = [
  { instructor_id: 'a', session_id: 'session-1', status: 'submitted', updated_at: '2026-11-14T03:00:00Z', submitted_at: '2026-11-14T03:00:00Z',
    instructors: person('Alex', 'Morgan'),
    grading_batch_students: [
      { student_id: 's2', candidate_number: 2, name: 'Ben Lim', notes: null, target_grade_id: 'blue-6th-kyu',
        grading_batch_results: [{ syllabus_item_id: 'k1', grade: 'C' }, { syllabus_item_id: 'b1', grade: 'A' }] },
      { student_id: 's1', candidate_number: 1, name: 'Ada Tan', notes: 'Strong ukemi', target_grade_id: 'blue-6th-kyu',
        grading_batch_results: [{ syllabus_item_id: 'k1', grade: 'A' }, { syllabus_item_id: 'b1', grade: 'B' }] },
      { student_id: 's3', candidate_number: 3, name: 'Cy Ong', notes: null, target_grade_id: 'brown-4th-kyu',
        grading_batch_results: [{ syllabus_item_id: 'r1', grade: null }] },
    ],
    grading_batch_items: [{ syllabus_item_id: 'k1', category: 'Kihon', label: 'Ikkyo', sort_order: 1, grade_id: 'blue-6th-kyu' },
      { syllabus_item_id: 'b1', category: 'Basics', label: 'Kamae', sort_order: 1, grade_id: 'blue-6th-kyu' },
      { syllabus_item_id: 'r1', category: 'Basics', label: 'Brown kamae', sort_order: 1, grade_id: 'brown-4th-kyu' }] },
  { instructor_id: 'b', session_id: 'session-1', status: 'draft', updated_at: '2026-11-14T03:10:00Z', submitted_at: null,
    instructors: person('Hiroshi', 'Sato'), grading_batch_students: [], grading_batch_items: [] },
]

let server, stub, AdminGradingDay, AdminGradingResults, AdminSchedule, moveOptions, AuthContext
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: [
      { find: '@/lib/supabase', replacement: new URL('./helpers/supabase-grading-stub.ts', import.meta.url).pathname },
      { find: '@/components/shared/FeedbackDialog', replacement: new URL('./helpers/feedback-dialog-stub.tsx', import.meta.url).pathname },
      { find: '@', replacement: new URL('../src', import.meta.url).pathname },
    ] } })
  stub = await server.ssrLoadModule(new URL('./helpers/supabase-grading-stub.ts', import.meta.url).pathname)
  ;({ AuthContext } = await server.ssrLoadModule('/src/lib/auth-context.ts'))
  ;({ default: AdminGradingDay, moveOptions } = await server.ssrLoadModule('/src/pages/admin/GradingDay.tsx'))
  ;({ default: AdminGradingResults } = await server.ssrLoadModule('/src/pages/admin/GradingResults.tsx'))
  ;({ default: AdminSchedule } = await server.ssrLoadModule('/src/pages/admin/GradingOpportunities.tsx'))
})
after(async () => { await server?.close() })
const mounted = []
afterEach(async () => {
  for (const { root, client } of mounted.splice(0)) { await act(async () => { root.unmount() }); client.clear() }
  stub.calls.length = 0
})
const plain = node => node.children.map(child => typeof child === 'string' ? child : plain(child)).join('')
const button = (root, text) => root.root.findAll(node => node.type === 'button' && plain(node).includes(text))[0]

async function render(path, { dayData = day, responses = {}, errors = {} } = {}) {
  stub.data.day = dayData
  stub.data.batches = batches
  stub.data.responses = responses
  stub.data.errors = errors
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let root
  await act(async () => {
    root = create(React.createElement(AuthContext.Provider, { value: auth('admin-a') }, React.createElement(QueryClientProvider, { client },
      React.createElement(MemoryRouter, { initialEntries: [path] },
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/admin/grading/days/:eventId', element: React.createElement(AdminGradingDay) }),
          React.createElement(Route, { path: '/admin/grading/days/:eventId/:sessionId', element: React.createElement(AdminGradingResults) }))))))
  })
  mounted.push({ root, client })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  return root
}
const textOf = root => JSON.stringify(root.toJSON())
const hrefs = root => root.root.findAll(node => node.type === 'a').map(node => node.props.href)
const auth = id => ({ session: { user: { id } }, profile: null, loading: false, error: null, reloadProfile() {}, signOut: async () => {} })

test('the admin grading day shows each session with its candidates, the panel\'s progress and a move control', async () => {
  const root = await render(`/admin/grading/days/${eventId}`)
  const text = textOf(root)
  assert.deepEqual(stub.calls.find(call => call[0] === 'rpc'), ['rpc', 'examiner_grading_day', { target_event: eventId }])
  assert.equal(root.root.find(node => node.type === 'h1').props.children, 'Adult grading')
  for (const expected of ['Session 1', 'Session 2', 'Ada Tan', 'Cy Ong', 'Alex Morgan', '"Chief"', '1 of 2 examiners submitted', '0 of 2 examiners submitted', 'Generate again', 'Target grade']) {
    assert.ok(text.includes(expected), expected)
  }
  // Admins see the panel, not "(you)", and examiner-only actions are absent.
  assert.ok(!text.includes('(you)'))
  assert.ok(!text.includes('Start grading'))
  assert.ok(hrefs(root).includes(`/admin/grading/days/${eventId}/session-1`))
  assert.ok(hrefs(root).includes('/admin/students/s1'))
  assert.ok(hrefs(root).includes('/admin/grading/opportunities'))
  // Moving is a row action, not an always-on select.
  assert.equal(root.root.findAll(node => node.type === 'select').length, 0)
  assert.ok(root.root.findAll(node => node.type === 'button' && node.props['aria-label'] === 'Move Cy Ong to another session').length)
  // The menu offers only the other sessions, and warns when the move empties a session.
  const decoded = (await import('./helpers/instructor-modules.mjs')).gradingPanels.decodeGradingDay(day)
  assert.deepEqual(moveOptions(decoded.sessions, decoded.sessions[0]).map(({ option, removesFrom }) => [option.id, removesFrom]), [['session-2', false]])
  const lone = { ...decoded.sessions[0], grades: [{ grade: blue, candidates: [decoded.sessions[0].grades[0].candidates[0]] }] }
  assert.deepEqual(moveOptions(decoded.sessions, lone).map(({ removesFrom }) => removesFrom), [true])
})

test('before sorting, the main action is Generate draft schedule in the header, and generating shows the session list', async () => {
  const root = await render(`/admin/grading/days/${eventId}`, { dayData: unsorted, responses: { sort_grading_sessions: day } })
  let text = textOf(root)
  assert.ok(text.includes('"Closed"'))
  assert.ok(!text.includes('Not sorted'), 'the student list waits for sorting before showing sessions')
  const sort = button(root, 'Generate draft schedule')
  assert.equal(sort.props.disabled, false)
  await act(async () => { sort.props.onClick() })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  assert.deepEqual(stub.calls.find(call => call[1] === 'sort_grading_sessions'), ['rpc', 'sort_grading_sessions', { target_event: eventId }])
  text = textOf(root)
  assert.ok(text.includes('Session 1') && text.includes('View results'), 'sorting shows the session list')
  assert.ok(button(root, 'Generate again'), 'the header now offers Generate again')
})

test('sorting is blocked while applications are open and gone once grading has started, and errors are explained', async () => {
  const open = await render(`/admin/grading/days/${eventId}`, { dayData: { ...unsorted, application_deadline: '2998-12-01' } })
  assert.equal(button(open, 'Generate draft schedule').props.disabled, true)
  assert.ok(textOf(open).includes('Applications open'))
  const sortedOpen = await render(`/admin/grading/days/${eventId}`, { dayData: { ...day, application_deadline: '2998-12-01' } })
  assert.equal(button(sortedOpen, 'Generate again').props.disabled, true)
  const started = await render(`/admin/grading/days/${eventId}`, { dayData: { ...day, grading_started: true } })
  const text = textOf(started)
  assert.equal(button(started, 'Generate again'), undefined)
  assert.ok(text.includes('Sessions are locked because grading has started.'))
  assert.equal(started.root.findAll(node => node.type === 'button' && String(node.props['aria-label']).startsWith('Move ')).length, 0)
  const failing = await render(`/admin/grading/days/${eventId}`, { dayData: unsorted,
    errors: { sort_grading_sessions: { code: 'PGS02', message: 'Grading has started, so sessions are locked' } } })
  await act(async () => { button(failing, 'Generate draft schedule').props.onClick() })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  assert.ok(textOf(failing).includes('An examiner has started grading'))
})

test('admin results show one examiner\'s submitted session checklist at a time, one read-only table per grade', async () => {
  const root = await render(`/admin/grading/days/${eventId}/session-1`)
  let text = textOf(root)
  assert.equal(root.root.findAll(node => node.type === 'input' || node.type === 'textarea').length, 0)
  const picker = root.root.findAll(node => node.type === 'button' && node.props['aria-pressed'] !== undefined)
  assert.equal(picker.length, 2)
  assert.equal(picker[0].props['aria-pressed'], true, 'the submitted examiner is shown first')
  for (const expected of ['Session 1', 'Submitted', 'Draft in progress', 'Strong ukemi', 'No comment', 'Technique', 'Kihon', 'Basics']) {
    assert.ok(text.includes(expected), expected)
  }
  assert.deepEqual(root.root.findAll(node => node.props?.role === 'region').map(node => node.props['aria-label']),
    ['Grading checklist: Blue (6th Kyu)', 'Grading checklist: Brown (4th Kyu)'])
  // Each cell shows the examiner's letter; a blank cell reads "Not marked". No pass/fail wording.
  const letters = root.root.findAll(node => typeof node.type === 'string' && node.props?.['data-mark'] !== undefined).map(node => node.props['data-mark'])
  assert.deepEqual([...letters].sort(), ['A', 'A', 'B', 'C'])
  assert.equal(text.match(/"Not marked"/g).length, 1)
  assert.ok(!text.includes('Passed') && !text.includes('Not passed'))
  // Candidates in number order within each grade.
  const heads = root.root.findAll(node => node.props?.['data-candidate-number'] !== undefined).map(node => node.props.children)
  assert.deepEqual(heads, [1, 2, 3])
  assert.ok(stub.calls.some(call => call[0] === 'select' && call[1] === 'grading_batches' && call[2].includes('target_grade_id')))
  await act(async () => { picker[1].props.onClick() })
  text = textOf(root)
  assert.ok(text.includes(' has a draft in progress. Their results appear here once they submit.'))
  assert.ok(!text.includes('Strong ukemi'))
})

test('admin results explain an unknown session', async () => {
  const text = textOf(await render(`/admin/grading/days/${eventId}/re-sorted`))
  assert.ok(text.includes('This session isn’t part of this grading.'))
})

test('the schedule shows each grading\'s lifecycle, its next action and warnings, with past gradings on their own tab', async () => {
  const grading = (id, date, deadline, overrides = {}) => ({ event_id: id, track: 'adult', grading_date: date,
    application_opens_on: '2026-10-01', application_deadline: deadline, reporting_release_on: date, reporting_time: '10:00:00',
    events: { name: `Adult grading — ${date}`, starts_at: `${date}T02:00:00Z`, ends_at: `${date}T04:00:00Z`, centres: { name: 'Central Dojo', address: '' } },
    grading_panel_members: [{ instructor_id: 'a', is_chief: true, added_at: '2026-01-01', instructors: { first_name: 'Alex', last_name: 'Morgan' } }],
    grading_applications: [{ status: 'submitted' }, { status: 'submitted' }, { status: 'withdrawn' }], grading_sessions: [], ...overrides })
  stub.data.gradings = [
    // Closed and unsorted, with a review pending and sessions running late.
    grading('up', '2999-01-02', '2026-11-01', { grading_applications: [{ status: 'submitted' }, { status: 'under_review' }],
      events: { name: 'Adult grading', starts_at: '2999-01-02T12:00:00Z', ends_at: '2999-01-02T14:00:00Z', centres: { name: 'Central Dojo', address: '' } } }),
    // Still open, and nobody on the panel.
    grading('later', '2999-02-01', '2998-12-01', { grading_panel_members: [] }),
    grading('past', '2000-01-01', '1999-12-01', { grading_sessions: [{ id: 's1', ends_at: null }, { id: 's2', ends_at: null }] })]
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  let root
  await act(async () => {
    root = create(React.createElement(AuthContext.Provider, { value: auth('admin-a') }, React.createElement(QueryClientProvider, { client },
      React.createElement(MemoryRouter, null, React.createElement(Routes, null,
        React.createElement(Route, { path: '*', element: React.createElement(AdminSchedule) }))))))
  })
  mounted.push({ root, client })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  let text = textOf(root)
  assert.match(text, /Next grading, in \d+ days/)
  // The same candidate wording and count as the instructor side: active applications.
  assert.equal(text.match(/"2 candidates"/g).length, 2)
  // Light cards: no stepper; a status pill says where each grading is.
  assert.equal(root.root.findAll(node => node.type === 'ol' && node.props['aria-label'] === 'Grading progress').length, 0)
  assert.deepEqual(root.root.findAll(node => node.props?.['data-status-pill'] !== undefined && typeof node.type === 'string')
    .map(node => node.props.children), ['Closed', 'Applications open'])
  assert.equal(text.match(/"Examiners"/g).length, 2)
  // The footer names the next action and lists warnings instead of repeating the stepper.
  const actions = root.root.findAll(node => node.type === 'a' && node.props['data-grading-stage'] !== undefined)
  assert.deepEqual(actions.map(node => [node.props['data-grading-stage'], node.props.href]),
    [['unsorted', '/admin/grading/days/up?list=sessions'], ['open', '/admin/grading/days/later?list=students']])
  assert.ok(text.includes('Sort into sessions') && text.includes('View candidates'))
  for (const warning of ['1 application under review', 'Runs past 9:00 pm', 'No examiners assigned']) assert.ok(text.includes(warning), warning)
  assert.ok(!text.includes('Ready to sort into sessions'))
  assert.ok(!text.includes('Nothing needs attention'))
  // Examiners show as avatar chips with initials when there is no photo.
  assert.ok(text.includes('"AM"'))
  // Past gradings live on their own tab.
  assert.ok(!text.includes('/admin/grading/days/past'))
  const past = root.root.findAll(node => node.type === 'button' && node.props['aria-pressed'] !== undefined)[1]
  await act(async () => { past.props.onClick() })
  text = textOf(root)
  assert.ok(hrefs(root).includes('/admin/grading/days/past'))
  assert.ok(text.includes('2 sessions'))
  assert.ok(!text.includes('Sort into sessions'))
})

test('the schedule page reuses a fresh cache on remount and refetches after invalidation', async () => {
  stub.data.errors = {}
  stub.data.gradings = []
  stub.calls.length = 0
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
  let root
  async function mount(id) {
    await act(async () => {
      root = create(React.createElement(QueryClientProvider, { client },
        React.createElement(AuthContext.Provider, { value: auth(id) },
          React.createElement(MemoryRouter, null, React.createElement(AdminSchedule)))))
    })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  }
  const reads = () => stub.calls.filter(call => call[0] === 'select' && call[1] === 'gradings').length
  try {
    await mount('admin-a')
    assert.match(textOf(root), /No upcoming gradings/)
    assert.equal(reads(), 2)
    await act(async () => root.unmount())
    await mount('admin-a')
    assert.equal(reads(), 2)
    await act(async () => { await client.invalidateQueries({ queryKey: ['admin', 'grading-schedule', 'admin-a'] }) })
    assert.equal(reads(), 4)
    await act(async () => root.unmount())
    await mount('admin-b')
    assert.equal(reads(), 6)
  } finally {
    if (root) await act(async () => root.unmount())
    client.clear()
  }
})
