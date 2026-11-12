import assert from 'node:assert/strict'
import test, { before, after, afterEach } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const eventId = '00000000-0000-4000-8000-000000000100'
const grade = (id, label, sort_order) => ({ id, label, colour: 'Blue', is_ranked: true, sort_order })
const blue = grade('blue-6th-kyu', 'Blue (6th Kyu)', 7)
const brown = grade('brown-4th-kyu', 'Brown (4th Kyu)', 10)
const candidate = (student_id, name, member_no, candidate_number) =>
  ({ application_id: `app-${student_id}`, student_id, name, member_no, candidate_number, current_grade: null })
const [ada, ben, cy] = [candidate('s1', 'Ada Tan', '012', 1), candidate('s2', 'Ben Lim', null, 2), candidate('s3', 'Cy Ong', '044', 3)]
const base = {
  event_id: eventId, name: 'Adult grading — 14 Nov 2026', status: 'scheduled', track: 'adult', grading_date: '2026-11-14',
  starts_at: '2026-11-14T02:00:00+00:00', ends_at: '2026-11-14T05:00:00+00:00', reporting_time: null, is_chief: false,
  application_deadline: '2026-11-10', grading_started: false,
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
        grading_batch_results: [{ syllabus_item_id: 'k1', checked: false }, { syllabus_item_id: 'b1', checked: true }] },
      { student_id: 's1', candidate_number: 1, name: 'Ada Tan', notes: 'Strong ukemi', target_grade_id: 'blue-6th-kyu',
        grading_batch_results: [{ syllabus_item_id: 'k1', checked: true }, { syllabus_item_id: 'b1', checked: true }] },
      { student_id: 's3', candidate_number: 3, name: 'Cy Ong', notes: null, target_grade_id: 'brown-4th-kyu',
        grading_batch_results: [{ syllabus_item_id: 'r1', checked: true }] },
    ],
    grading_batch_items: [{ syllabus_item_id: 'k1', category: 'Kihon', label: 'Ikkyo', sort_order: 1, grade_id: 'blue-6th-kyu' },
      { syllabus_item_id: 'b1', category: 'Basics', label: 'Kamae', sort_order: 1, grade_id: 'blue-6th-kyu' },
      { syllabus_item_id: 'r1', category: 'Basics', label: 'Brown kamae', sort_order: 1, grade_id: 'brown-4th-kyu' }] },
  { instructor_id: 'b', session_id: 'session-1', status: 'draft', updated_at: '2026-11-14T03:10:00Z', submitted_at: null,
    instructors: person('Hiroshi', 'Sato'), grading_batch_students: [], grading_batch_items: [] },
]

let server, stub, AdminGradingDay, AdminGradingResults
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: [
      { find: '@/lib/supabase', replacement: new URL('./helpers/supabase-grading-stub.ts', import.meta.url).pathname },
      { find: '@', replacement: new URL('../src', import.meta.url).pathname },
    ] } })
  stub = await server.ssrLoadModule(new URL('./helpers/supabase-grading-stub.ts', import.meta.url).pathname)
  ;({ default: AdminGradingDay } = await server.ssrLoadModule('/src/pages/admin/GradingDay.tsx'))
  ;({ default: AdminGradingResults } = await server.ssrLoadModule('/src/pages/admin/GradingResults.tsx'))
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
    root = create(React.createElement(QueryClientProvider, { client },
      React.createElement(MemoryRouter, { initialEntries: [path] },
        React.createElement(Routes, null,
          React.createElement(Route, { path: '/admin/grading/days/:eventId', element: React.createElement(AdminGradingDay) }),
          React.createElement(Route, { path: '/admin/grading/days/:eventId/:sessionId', element: React.createElement(AdminGradingResults) })))))
  })
  mounted.push({ root, client })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  return root
}
const textOf = root => JSON.stringify(root.toJSON())
const hrefs = root => root.root.findAll(node => node.type === 'a').map(node => node.props.href)

test('the admin grading day shows each session with its candidates, the panel\'s progress and a move control', async () => {
  const root = await render(`/admin/grading/days/${eventId}`)
  const text = textOf(root)
  assert.deepEqual(stub.calls.find(call => call[0] === 'rpc'), ['rpc', 'examiner_grading_day', { target_event: eventId }])
  assert.equal(root.root.find(node => node.type === 'h1').props.children, 'Adult grading')
  for (const expected of ['Session 1', 'Session 2', 'Ada Tan', 'Cy Ong', 'Alex Morgan', ' · Chief', '1 of 2 examiners submitted', '0 of 2 examiners submitted', 'Sort again', 'Target grade']) {
    assert.ok(text.includes(expected), expected)
  }
  // Admins see the panel, not "(you)", and examiner-only actions are absent.
  assert.ok(!text.includes('(you)'))
  assert.ok(!text.includes('Start grading'))
  assert.ok(hrefs(root).includes(`/admin/grading/days/${eventId}/session-1`))
  assert.ok(hrefs(root).includes('/admin/students/s1'))
  assert.ok(hrefs(root).includes('/admin/grading/opportunities'))
  // Moving Cy into session 2 sends the application and the target session.
  const moved = { ...day, sessions: [day.sessions[0]] }
  stub.data.responses = { move_grading_candidate: moved }
  const select = root.root.find(node => node.type === 'select' && node.props['aria-label'] === 'Move Cy Ong to another session')
  assert.deepEqual(select.findAllByType('option').map(option => option.props.children), ['Session 1', 'Session 2'])
  await act(async () => { select.props.onChange({ target: { value: 'session-2' } }) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  assert.deepEqual(stub.calls.find(call => call[1] === 'move_grading_candidate'), ['rpc', 'move_grading_candidate', { target_application: 'app-s3', target_session: 'session-2' }])
  assert.ok(!textOf(root).includes('Session 2'), 'the returned day replaces the page')
})

test('before sorting, admins see the student list and can sort once applications close', async () => {
  const root = await render(`/admin/grading/days/${eventId}`, { dayData: unsorted, responses: { sort_grading_sessions: day } })
  let text = textOf(root)
  assert.ok(text.includes('Not sorted'))
  assert.ok(!text.includes('Sort into sessions'), 'the student list comes first')
  await act(async () => { button(root, 'Session list').props.onClick() })
  const sort = button(root, 'Sort into sessions')
  assert.equal(sort.props.disabled, false)
  await act(async () => { sort.props.onClick() })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
  assert.deepEqual(stub.calls.find(call => call[1] === 'sort_grading_sessions'), ['rpc', 'sort_grading_sessions', { target_event: eventId }])
  text = textOf(root)
  assert.ok(text.includes('Session 1') && text.includes('View results'), 'sorting shows the session list')
})

test('sorting is blocked while applications are open or once grading has started, and errors are explained', async () => {
  const open = await render(`/admin/grading/days/${eventId}?list=sessions`, { dayData: { ...unsorted, application_deadline: '2999-01-01' } })
  assert.equal(button(open, 'Sort into sessions').props.disabled, true)
  assert.ok(textOf(open).includes('Applications close on'))
  const sortedOpen = await render(`/admin/grading/days/${eventId}`, { dayData: { ...day, application_deadline: '2999-01-01' } })
  assert.equal(button(sortedOpen, 'Sort again').props.disabled, true)
  assert.ok(textOf(sortedOpen).includes('Applications close on'))
  const started = await render(`/admin/grading/days/${eventId}`, { dayData: { ...day, grading_started: true } })
  const text = textOf(started)
  // Sort again stays visible but disabled, with the reason beside it.
  assert.equal(button(started, 'Sort again').props.disabled, true)
  assert.ok(text.includes('An examiner has started grading, so sessions can no longer change.'))
  assert.equal(started.root.findAll(node => node.type === 'select').length, 0)
  const failing = await render(`/admin/grading/days/${eventId}?list=sessions`, { dayData: unsorted,
    errors: { sort_grading_sessions: { code: 'PGS02', message: 'Grading has started, so sessions are locked' } } })
  await act(async () => { button(failing, 'Sort into sessions').props.onClick() })
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
  // Ben failed Ikkyo; everything else passed.
  assert.equal(text.match(/"Not passed"/g).length, 1)
  assert.equal(text.match(/"Passed"/g).length, 4)
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
