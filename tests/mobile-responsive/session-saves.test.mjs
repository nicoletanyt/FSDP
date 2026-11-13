import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173'
const driver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'
const studentId = '00000000-0000-4000-8000-000000000100'
const assessmentPath = `/instructor/assessments/00000000-0000-4000-8000-202611070008/${studentId}`
let session
async function request(path, body, method = 'POST') {
  const response = await fetch(driver + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const result = await response.json()
  if (!response.ok) throw new Error(JSON.stringify(result))
  return result.value
}
before(async () => {
  const created = await request('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] } } } })
  session = created.sessionId
  await request(`/session/${session}/url`, { url: `${origin}/tests/mobile-responsive/calendar.html` })
})
after(async () => { if (session) await request(`/session/${session}`, undefined, 'DELETE') })
async function inPage(width, route, inspect) {
  const result = await request(`/session/${session}/execute/async`, { args: [], script: `
    const done = arguments[arguments.length - 1];
    (async () => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;top:0;left:0;border:0;width:${width}px;height:700px';
      document.body.append(f);
      try {
        await new Promise(resolve => { f.onload = () => setTimeout(resolve, 700); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(${JSON.stringify(route)}); });
        const w = f.contentWindow, wait = (ms = 350) => new Promise(resolve => setTimeout(resolve, ms));
        const ui = (${editorUI.toString()})(w, wait);
        done(await (${inspect.toString()})(w, wait, f, ui));
      } catch (error) { done({ scriptError: String(error) }); }
      finally { f.remove(); }
    })();` })
  assert.equal(result?.scriptError, undefined, result?.scriptError)
  return result
}
function editorUI(w, wait) {
  const d = w.document
  return {
    root: () => d.querySelector('form'),
    button(text, root = d) { return [...root.querySelectorAll('button')].find(e => e.textContent.trim() === text) },
    async type(value, root = d) {
      const input = root.querySelector('textarea')
      Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50)
    },
  }
}

test('acknowledged assessment saves retry only reads when refresh fails', async () => {
  const result = await inPage(390, `${assessmentPath}?fixtureData=assessment-postread-error`, async (w, wait, _f, ui) => {
    const root = w.document.querySelector('main')
    await ui.type('Saved but reload failed', root)
    ui.button('Save Assessment', root).click(); await wait()
    const message = root.querySelector('[role="alert"]').textContent
    ui.button('Reload saved record', root).click(); await wait()
    return { message, requests: w.sessionWriteRequestsFixture.length, value: root.querySelector('textarea')?.value ?? root.textContent }
  })
  assert.match(result.message, /record was saved, but could not be reloaded/)
  assert.equal(result.requests, 1)
  assert.match(result.value, /Saved but reload failed/)
})

test('assessment status/notes save, clear and remain associated with the recorded application target', async () => {
  const result = await inPage(390, `${assessmentPath}?fixtureData=assessment-save`, async (w, wait, _f, ui) => {
    const d = w.document
    ui.button('completed', ui.root()).click(); await ui.type('Completed assessment notes', ui.root())
    ui.button('Save Assessment', ui.root()).click(); await wait()
    const first = { notes: d.querySelector('textarea').value, selected: d.querySelector('[aria-pressed="true"]').textContent, text: ui.root().textContent }
    ui.button('completed', ui.root()).click(); await ui.type('', ui.root())
    ui.button('Save Assessment', ui.root()).click(); await wait()
    return { first, after: { notes: d.querySelector('textarea').value, selected: d.querySelectorAll('[aria-pressed="true"]').length }, requests: w.sessionWriteRequestsFixture }
  })
  assert.equal(result.first.notes, 'Completed assessment notes')
  assert.equal(result.first.selected, 'completed')
  assert.match(result.first.text, /Assessment saved/)
  assert.match(result.first.text, /Recorded application grade/)
  assert.deepEqual(result.after, { notes: '', selected: 0 })
  assert.equal(result.requests[1].status, null)
})

test('assessment errors, receipt retries and conflicts preserve the draft/status and require fresh expectations', async () => {
  for (const mode of ['assessment-save-error', 'assessment-lost-response', 'assessment-conflict']) {
    const result = await inPage(390, `${assessmentPath}?fixtureData=${mode}`, async (w, wait, _f, ui) => {
      ui.button('completed', ui.root()).click(); await ui.type('Assessment retry draft', ui.root())
      ui.button('Save Assessment', ui.root()).click(); await wait()
      const root = w.document.querySelector('main')
      const before = { message: root.querySelector('[role="alert"]').textContent, hidden: !root.querySelector('textarea') }
      const reload = ui.button('Reload saved record', root)
      let reloaded
      if (reload) {
        reload.click(); await wait()
        reloaded = { draft: w.document.querySelector('textarea').value, status: w.document.querySelector('[aria-pressed="true"]').textContent }
        ui.button('Save Assessment', ui.root()).click()
      } else ui.button('Retry save', root).click()
      await wait()
      return { before, reloaded, notes: w.document.querySelector('textarea').value, requests: w.sessionWriteRequestsFixture, text: ui.root().textContent }
    })
    assert.ok(result.before.message)
    assert.equal(result.before.hidden, true)
    if (result.reloaded) assert.deepEqual(result.reloaded, { draft: 'Assessment retry draft', status: 'completed' })
    assert.equal(result.notes, 'Assessment retry draft')
    assert.match(result.text, /Assessment saved/)
    if (mode === 'assessment-conflict') { assert.notEqual(result.requests[0].requestId, result.requests[1].requestId); assert.equal(result.requests[1].expected.notes, 'Newer server notes') }
    else assert.deepEqual(result.requests[0], result.requests[1])
  }
})

test('cancelled assessments stay read-only', async () => {
  const cancelled = await inPage(390, `${assessmentPath}?fixtureData=assessment-cancelled`, w => ({ readOnly: w.document.querySelector('textarea').readOnly, save: w.document.querySelector('[type="submit"]').disabled }))
  assert.deepEqual(cancelled, { readOnly: true, save: true })
})

test('assessment persistence survives a document reload through the fixture stored-read paths', async () => {
  const result = await inPage(390, `${assessmentPath}?fixtureData=assessment-persistence`, async (w, wait, f, ui) => {
    await ui.type('Persisted record after reload', ui.root())
    ui.button('Save Assessment', ui.root()).click(); await wait()
    const route = w.location.pathname + w.location.search
    await new Promise(resolve => { f.onload = () => setTimeout(resolve, 700); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(route) })
    const d = f.contentDocument
    const value = d.querySelector('main textarea')?.value ?? d.querySelector('main').textContent
    f.contentWindow.sessionStorage.removeItem('test-only-session-writes:audit')
    return value
  })
  assert.match(result, /Persisted record after reload/)
})

test('old-account save responses and drafts do not populate the replacement account', async () => {
  const result = await inPage(390, `${assessmentPath}?fixtureData=assessment-slow`, async (w, wait, _f, ui) => {
    await ui.type('Old account private draft', ui.root())
    ui.button('Save Assessment', ui.root()).click(); await wait(100)
    w.switchInstructorFixture(); await wait(1800)
    return { text: w.document.querySelector('main').textContent, notes: w.document.querySelector('textarea')?.value ?? '' }
  })
  assert.doesNotMatch(result.text + result.notes, /Old account private draft|Assessment saved\./)
})

test('pending assessments preserve both draft fields and suppress duplicate submits until the authoritative reload', async () => {
  const result = await inPage(390, `${assessmentPath}?fixtureData=assessment-slow`, async (w, wait, _f, ui) => {
    ui.button('completed', ui.root()).click(); await ui.type('Pending assessment draft', ui.root())
    ui.root().dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))
    ui.root().dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(100)
    const pending = { draft: w.document.querySelector('main textarea').value, readOnly: w.document.querySelector('main textarea').readOnly,
      selected: w.document.querySelector('main [aria-pressed="true"]').textContent, text: ui.root().textContent, count: w.sessionWriteRequestsFixture.length }
    await wait(1700)
    return { pending, after: ui.root().textContent, count: w.sessionWriteRequestsFixture.length }
  })
  assert.equal(result.pending.draft, 'Pending assessment draft')
  assert.equal(result.pending.selected, 'completed')
  assert.equal(result.pending.readOnly, true)
  assert.equal(result.pending.count, 1)
  assert.doesNotMatch(result.pending.text, /Assessment saved/)
  assert.match(result.after, /Assessment saved/)
  assert.equal(result.count, 1)
})

test('late save responses cannot replace a newly selected assessment candidate', async () => {
  const result = await inPage(390, `${assessmentPath}?fixtureData=assessment-slow`, async (w, wait, _f, ui) => {
    await ui.type('Previous candidate private draft', ui.root())
    ui.button('Save Assessment', ui.root()).click(); await wait(100)
    const next = w.location.pathname.replace(/000000000100$/, '000000000101') + w.location.search
    w.history.pushState(null, '', next); w.dispatchEvent(new w.PopStateEvent('popstate')); await wait(1800)
    return { path: w.location.pathname, text: w.document.querySelector('main').textContent, notes: w.document.querySelector('main textarea')?.value ?? '' }
  })
  assert.match(result.path, /000000000101$/)
  assert.doesNotMatch(result.text + result.notes, /Previous candidate private draft|Assessment saved\./)
})
