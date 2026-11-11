import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { createServer } from 'vite'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
// useEmptyAuthForm listens for pageshow; the renderer has no DOM window.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} }

let server, CreateInstructorForm, stub
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true },
    resolve: { alias: [
      { find: '@/lib/supabase', replacement: new URL('./helpers/supabase-grades-stub.ts', import.meta.url).pathname },
      { find: '@', replacement: new URL('../src', import.meta.url).pathname },
    ] } })
  ;({ default: CreateInstructorForm } = await server.ssrLoadModule('/src/components/auth/CreateInstructorForm.tsx'))
  stub = await server.ssrLoadModule(new URL('./helpers/supabase-grades-stub.ts', import.meta.url).pathname)
})
after(async () => { await server?.close() })

async function render() {
  let root
  await act(async () => { root = create(React.createElement(CreateInstructorForm), { createNodeMock: () => ({ reset() {}, focus() {} }) }) })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
  return root
}
const select = (root, id) => root.root.find(node => node.type === 'select' && node.props.id === id)
const options = node => node.findAllByType('option').map(option => ({ value: option.props.value, disabled: Boolean(option.props.disabled),
  text: [option.props.children].flat().join('') }))
const hint = root => root.root.findAll(node => node.type === 'p' && node.props.id === 'instructor-title-hint')[0]?.props.children
async function choose(root, id, value) {
  await act(async () => { select(root, id).props.onChange({ target: { value } }) })
}

test('grade is required, excludes Unranked and has no "not recorded" option', async () => {
  const root = await render()
  const grade = select(root, 'instructor-grade')
  assert.equal(grade.props.required, true)
  assert.ok(stub.gradeQueries.some(call => call[0] === 'eq' && call[1] === 'is_ranked' && call[2] === true))
  assert.deepEqual(options(grade)[0], { value: '', disabled: true, text: 'Select a grade' })
  assert.ok(!options(grade).some(option => /not recorded|unranked/i.test(option.text)))
})

test('title is locked to none with a hint until the grade allows a title', async () => {
  const root = await render()
  assert.equal(select(root, 'instructor-title').props.disabled, true)
  assert.equal(select(root, 'instructor-title').props.value, 'none')
  assert.equal(hint(root), 'Select a grade first')
  for (const grade of ['black-2nd-kyu', '1st-dan']) {
    await choose(root, 'instructor-grade', grade)
    assert.equal(select(root, 'instructor-title').props.disabled, true, grade)
    assert.equal(hint(root), 'Requires 2nd dan or above')
  }
})

test('options the grade does not allow are disabled with their minimum dan', async () => {
  const root = await render()
  await choose(root, 'instructor-grade', '2nd-dan')
  const title = select(root, 'instructor-title')
  assert.equal(title.props.disabled, false)
  assert.equal(hint(root), undefined)
  assert.deepEqual(options(title), [
    { value: 'none', disabled: false, text: 'None' },
    { value: 'fukushidoin', disabled: false, text: 'Fuku-shidōin' },
    { value: 'shidoin', disabled: true, text: 'Shidōin (4th dan+)' },
    { value: 'shihan', disabled: true, text: 'Shihan (6th dan+)' },
  ])
})

test('changing to a grade that disallows the current title resets it to none', async () => {
  const root = await render()
  await choose(root, 'instructor-grade', '4th-dan')
  await choose(root, 'instructor-title', 'shidoin')
  await choose(root, 'instructor-grade', '2nd-dan')
  assert.equal(select(root, 'instructor-title').props.value, 'none')
  await choose(root, 'instructor-grade', '4th-dan')
  await choose(root, 'instructor-title', 'fukushidoin')
  await choose(root, 'instructor-grade', '2nd-dan')
  assert.equal(select(root, 'instructor-title').props.value, 'fukushidoin')
  await choose(root, 'instructor-grade', '1st-dan')
  assert.equal(select(root, 'instructor-title').props.value, 'none')
})

test('the examiner checkbox defaults to off and toggles', async () => {
  const root = await render()
  const checkbox = () => root.root.find(node => node.type === 'input' && node.props.name === 'is_examiner')
  assert.equal(checkbox().props.checked, false)
  await act(async () => { checkbox().props.onChange({ target: { checked: true } }) })
  assert.equal(checkbox().props.checked, true)
})
