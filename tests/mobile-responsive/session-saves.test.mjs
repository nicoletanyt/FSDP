import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173'
const driver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'
const studentId = '00000000-0000-4000-8000-000000000100'
const reportPath = `/instructor/students/${studentId}?tab=sessions`
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
    root: () => d.querySelector('[data-session-id="00000000-0000-4000-8000-000000005001"] [data-report-editor]') ?? d.querySelector('form'),
    button(text, root = d) { return [...root.querySelectorAll('button')].find(e => e.textContent.trim() === text) },
    async open() { this.button('Add report', this.root()).click(); await wait() },
    async type(value, root = d) {
      const input = root.querySelector('textarea')
      Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50)
    },
  }
}

test('Add report, author-owned edit/clear and recorded authorship use the existing responsive editor', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inPage(width, `${reportPath}&fixtureData=report-edit`, async (w, wait, _f, ui) => {
      const d = w.document
      await ui.open(); await ui.type('New stored report\nSecond line', ui.root())
      ui.button('Save', ui.root()).click(); await wait()
      const first = ui.root().textContent
      const author = ui.root().querySelector('[data-instructor-id]').getAttribute('data-instructor-id')
      ui.button('Edit report', ui.root()).click(); await wait(); await ui.type('Updated stored report', ui.root())
      ui.button('Save', ui.root()).click(); await wait()
      const edited = ui.root().textContent
      ui.button('Edit report', ui.root()).click(); await wait(); await ui.type('', ui.root())
      ui.button('Save', ui.root()).click(); await wait()
      return { first, author, edited, cleared: ui.root().textContent, requests: w.sessionWriteRequestsFixture,
        fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth }
    })
    assert.match(result.first, /New stored report\nSecond line/)
    assert.match(result.first, /Report saved/)
    assert.equal(result.author, '00000000-0000-4000-8000-000000000001')
    assert.match(result.edited, /Updated stored report/)
    assert.match(result.cleared, /No report recorded/)
    assert.equal(result.requests.length, 3)
    assert.equal(result.requests[0].expectedUserId, '00000000-0000-4000-8000-000000090001')
    assert.notEqual(result.requests[0].expectedUserId, result.author)
    assert.equal(result.fits, true)
  })
})

test('other/unknown authors, other teachers, cancelled records and unlinked accounts retain read access without report edit access', async () => {
  const result = await inPage(390, `${reportPath}&fixtureData=report-edit`, w => {
    const cards = [...w.document.querySelectorAll('[data-session-id]')]
    return cards.slice(0, 7).map(card => ({ disabled: card.querySelector('[data-report-editor] button').disabled, text: card.textContent }))
  })
  assert.equal(result[0].disabled, false)
  assert.equal(result[1].disabled, false)
  for (const index of [2, 3, 5, 6]) assert.equal(result[index].disabled, true)
  assert.match(result[3].text, /Report author not recorded/)
  for (const mode of ['report-cancelled', 'unlinked']) {
    assert.equal(await inPage(390, `${reportPath}&fixtureData=${mode}`, w => [...w.document.querySelectorAll('[data-report-editor] button')].every(e => e.disabled)), true)
  }
})

test('pending reports retain the draft and prevent duplicate submissions and success notices before confirmation', async () => {
  const result = await inPage(390, `${reportPath}&fixtureData=report-slow`, async (w, wait, _f, ui) => {
    await ui.open(); await ui.type('Pending report draft', ui.root())
    ui.root().querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))
    ui.root().querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(100)
    const pending = { value: ui.root().querySelector('textarea').value, readOnly: ui.root().querySelector('textarea').readOnly, text: ui.root().textContent, count: w.sessionWriteRequestsFixture.length }
    await wait(1700)
    return { pending, after: ui.root().textContent, count: w.sessionWriteRequestsFixture.length }
  })
  assert.equal(result.pending.value, 'Pending report draft')
  assert.equal(result.pending.readOnly, true)
  assert.equal(result.pending.count, 1)
  assert.doesNotMatch(result.pending.text, /Report saved/)
  assert.match(result.after, /Report saved/)
  assert.equal(result.count, 1)
})

test('report failures/lost responses keep drafts and retry the immutable request without overwriting a newer report', async () => {
  for (const mode of ['report-save-error', 'report-lost-response', 'report-retry-after-change']) {
    const result = await inPage(390, `${reportPath}&fixtureData=${mode}`, async (w, wait, _f, ui) => {
      await ui.open(); await ui.type('Retry report draft', ui.root()); ui.button('Save', ui.root()).click(); await wait()
      const before = { draft: ui.root().querySelector('textarea').value, message: ui.root().querySelector('[role="alert"]').textContent }
      ui.button('Retry save', ui.root()).click(); await wait()
      return { before, after: ui.root().textContent, requests: w.sessionWriteRequestsFixture }
    })
    assert.equal(result.before.draft, 'Retry report draft')
    assert.equal(result.requests.length, 2)
    assert.deepEqual(result.requests[0], result.requests[1])
    assert.match(result.after, mode === 'report-retry-after-change' ? /Newer server report/ : /Retry report draft/)
  }
})

test('report conflicts reload the saved version without replacing the draft, then save using the refreshed snapshot', async () => {
  const result = await inPage(390, `${reportPath}&fixtureData=report-conflict`, async (w, wait, _f, ui) => {
    await ui.open(); await ui.type('My report draft', ui.root()); ui.button('Save', ui.root()).click(); await wait()
    const before = ui.root().querySelector('textarea').value
    ui.button('Reload saved record', ui.root()).click(); await wait()
    const afterReload = { draft: ui.root().querySelector('textarea').value, text: ui.root().textContent }
    ui.button('Save', ui.root()).click(); await wait()
    return { before, afterReload, after: ui.root().textContent, requests: w.sessionWriteRequestsFixture }
  })
  assert.equal(result.before, 'My report draft')
  assert.equal(result.afterReload.draft, 'My report draft')
  assert.match(result.afterReload.text, /Newer server report/)
  assert.match(result.after, /Report saved/)
  assert.equal(result.requests[1].expected.report, 'Newer server report')
  assert.notEqual(result.requests[0].requestId, result.requests[1].requestId)
})

test('acknowledged report and assessment saves retry only reads when refresh fails', async () => {
  for (const kind of ['report', 'assessment']) {
    const path = kind === 'report' ? reportPath : assessmentPath + '?'
    const result = await inPage(390, `${path}&fixtureData=${kind}-postread-error`, async (w, wait, _f, ui) => {
      if (w.location.pathname.includes('/students/')) await ui.open()
      const root = ui.root()
      await ui.type('Saved but reload failed', root)
      ui.button(root.hasAttribute('data-report-editor') ? 'Save' : 'Save Assessment', root).click(); await wait()
      const message = root.querySelector('[role="alert"]').textContent
      ui.button('Reload saved record', root).click(); await wait()
      return { message, requests: w.sessionWriteRequestsFixture.length, value: root.querySelector('textarea')?.value ?? root.textContent }
    })
    assert.match(result.message, /record was saved, but could not be reloaded/)
    assert.equal(result.requests, 1)
    assert.match(result.value, /Saved but reload failed/)
  }
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
      const before = { draft: w.document.querySelector('textarea').value, status: w.document.querySelector('[aria-pressed="true"]').textContent }
      const reload = ui.button('Reload saved record', ui.root())
      if (reload) { reload.click(); await wait(); ui.button('Save Assessment', ui.root()).click() }
      else ui.button('Retry save', ui.root()).click()
      await wait()
      return { before, notes: w.document.querySelector('textarea').value, requests: w.sessionWriteRequestsFixture, text: ui.root().textContent }
    })
    assert.deepEqual(result.before, { draft: 'Assessment retry draft', status: 'completed' })
    assert.equal(result.notes, 'Assessment retry draft')
    assert.match(result.text, /Assessment saved/)
    if (mode === 'assessment-conflict') { assert.notEqual(result.requests[0].requestId, result.requests[1].requestId); assert.equal(result.requests[1].expected.notes, 'Newer server notes') }
    else assert.deepEqual(result.requests[0], result.requests[1])
  }
})

test('cancelled assessments stay read-only; grouped class reports expose the same author-owned save flow', async () => {
  const cancelled = await inPage(390, `${assessmentPath}?fixtureData=assessment-cancelled`, w => ({ readOnly: w.document.querySelector('textarea').readOnly, save: w.document.querySelector('[type="submit"]').disabled }))
  assert.deepEqual(cancelled, { readOnly: true, save: true })
  const saved = await inPage(390, '/instructor/reports/00000000-0000-4000-8000-202611020001', async (w, wait, _f, ui) => {
    const root = w.document.querySelectorAll('[data-report-editor]')[2]
    ui.button('Add report', root).click(); await wait(); await ui.type('Grouped report saved', root)
    ui.button('Save', root).click(); await wait()
    return root.textContent
  })
  assert.match(saved, /Grouped report saved/)
  assert.match(saved, /Report by Test Instructor/)
})

test('report and assessment persistence survives a document reload through the fixture stored-read paths', async () => {
  for (const kind of ['report', 'assessment']) {
    const path = kind === 'report' ? reportPath : assessmentPath + '?'
    const result = await inPage(390, `${path}&fixtureData=${kind}-persistence`, async (w, wait, f, ui) => {
      if (w.location.pathname.includes('/students/')) await ui.open()
      await ui.type('Persisted record after reload', ui.root())
      ui.button(ui.root().hasAttribute('data-report-editor') ? 'Save' : 'Save Assessment', ui.root()).click(); await wait()
      const route = w.location.pathname + w.location.search
      await new Promise(resolve => { f.onload = () => setTimeout(resolve, 700); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(route) })
      const d = f.contentDocument
      const value = d.querySelector('main textarea')?.value ?? d.querySelector('main').textContent
      f.contentWindow.sessionStorage.removeItem('test-only-session-writes:audit')
      return value
    })
    assert.match(result, /Persisted record after reload/)
  }
})

test('old-account save responses and drafts do not populate the replacement account', async () => {
  for (const kind of ['report', 'assessment']) {
    const path = kind === 'report' ? reportPath : assessmentPath + '?'
    const result = await inPage(390, `${path}&fixtureData=${kind}-slow`, async (w, wait, _f, ui) => {
      if (w.location.pathname.includes('/students/')) await ui.open()
      await ui.type('Old account private draft', ui.root())
      ui.button(ui.root().hasAttribute('data-report-editor') ? 'Save' : 'Save Assessment', ui.root()).click(); await wait(100)
      w.switchInstructorFixture(); await wait(1800)
      return { text: w.document.querySelector('main').textContent, notes: w.document.querySelector('textarea')?.value ?? '' }
    })
    assert.doesNotMatch(result.text + result.notes, /Old account private draft|Report saved\.|Assessment saved\./)
  }
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

test('late save responses cannot replace a newly selected student or assessment candidate', async () => {
  for (const kind of ['report', 'assessment']) {
    const path = kind === 'report' ? reportPath : assessmentPath + '?'
    const result = await inPage(390, `${path}&fixtureData=${kind}-slow`, async (w, wait, _f, ui) => {
      if (w.location.pathname.includes('/students/')) await ui.open()
      await ui.type('Previous candidate private draft', ui.root())
      ui.button(ui.root().hasAttribute('data-report-editor') ? 'Save' : 'Save Assessment', ui.root()).click(); await wait(100)
      const next = w.location.pathname.replace(/000000000100$/, '000000000101') + w.location.search
      w.history.pushState(null, '', next); w.dispatchEvent(new w.PopStateEvent('popstate')); await wait(1800)
      return { path: w.location.pathname, text: w.document.querySelector('main').textContent, notes: w.document.querySelector('main textarea')?.value ?? '' }
    })
    assert.match(result.path, /000000000101$/)
    assert.doesNotMatch(result.text + result.notes, /Previous candidate private draft|Report saved\.|Assessment saved\./)
  }
})
