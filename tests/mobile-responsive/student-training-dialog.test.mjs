import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173'
const driver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'
const classId = '00000000-0000-4000-8000-202611020001'
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

async function inCalendar(width, inspect, mode = '', height = 800) {
  const route = `/instructor/calendar?view=month&date=2026-11-2&session=${classId}&fixtureData=${mode}`
  const result = await request(`/session/${session}/execute/async`, { args: [], script: `
    const done = arguments[arguments.length - 1];
    (async () => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;top:0;left:0;border:0;width:${width}px;height:${height}px';
      document.body.append(f);
      try {
        await new Promise(resolve => { f.onload = () => setTimeout(resolve, 800); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(${JSON.stringify(route)}); });
        const w = f.contentWindow, wait = (ms = 350) => new Promise(resolve => setTimeout(resolve, ms));
        const ui = (${dialogUI.toString()})(w);
        done(await (${inspect.toString()})(w, wait, ui));
      } catch (error) { done({ error: String(error) }); }
      finally { f.remove(); }
    })();` })
  assert.equal(result?.error, undefined, result?.error)
  return result
}

function dialogUI(w) {
  const d = w.document
  return {
    triggers: () => [...d.querySelectorAll('button[aria-label^="Open progress checklist for"]')].filter(e => e.getBoundingClientRect().height > 0),
    root: () => d.querySelector('[data-student-training-dialog]'),
    close() { [...this.root().querySelectorAll('button')].find(e => e.textContent.trim() === 'Close progress checklist').click() },
    button(text, root = this.root()) { return [...root.querySelectorAll('button')].find(e => e.textContent.trim() === text) },
  }
}

test('checklist buttons open the progress checklist with a student card and no sidebar, without leaving the calendar', async t => {
  // From 375px; a 320px roster has no room for the checklist button (see calendar.test.mjs).
  for (const width of [375, 390, 768, 1280]) await t.test(`${width}px`, async () => {
    const result = await inCalendar(width, async (w, wait, ui) => {
      const d = w.document
      const route = w.location.pathname + w.location.search
      const readsBefore = w.studentDetailReadsFixture.length
      const roster = d.querySelector('[aria-label="Student roster"]')
      const rosterText = roster.textContent
      const trigger = ui.triggers()[0]
      trigger.focus(); trigger.click(); await wait()
      const root = ui.root()
      const checklist = root.querySelector('[aria-label="Progress checklist"]')
      const card = root.querySelector('[data-progress-student]')
      const statusControls = [...checklist.querySelectorAll('[role="combobox"]')]
      const bounds = root.getBoundingClientRect()
      const before = { text: root.textContent, readsBefore, readsAfter: w.studentDetailReadsFixture.length,
        title: root.querySelector('[data-slot="dialog-title"]').textContent.trim(),
        cardText: card?.textContent,
        cardFirst: card.getBoundingClientRect().bottom <= root.querySelector('[data-syllabus-id]').getBoundingClientRect().top,
        sidebar: Boolean(root.querySelector('[aria-label="Student details"], [aria-label="Student information"]')),
        editable: statusControls.length > 0 && statusControls.every(e => !e.hasAttribute('disabled')),
        fits: root.scrollWidth <= root.clientWidth && d.documentElement.scrollWidth <= d.documentElement.clientWidth,
        bounded: bounds.top >= 0 && bounds.bottom <= w.innerHeight + 1 && bounds.left >= 0 && bounds.right <= w.innerWidth + 1,
        heightCapped: bounds.height <= w.innerHeight * 0.85 + 1,
        centered: Math.abs(bounds.top + bounds.height / 2 - w.innerHeight / 2) < 2,
        focusInside: root.contains(d.activeElement),
      }
      ui.close(); await wait()
      return { ...before, closed: !ui.root(), focusReturned: d.activeElement === trigger,
        routeUnchanged: route === w.location.pathname + w.location.search,
        sameRoster: d.querySelector('[aria-label="Student roster"]') === roster && roster.textContent === rosterText,
        writes: w.attendanceRequestsFixture.length + w.sessionWriteRequestsFixture.length,
        drawerRemains: Boolean(d.querySelector('[data-slot="drawer-content"]')) }
    })
    assert.equal(result.title, 'Progress checklist')
    assert.match(result.cardText, /Emma Wilson.*10th Kyu.*Stored next grade.*1 of 1 techniques consistent/)
    assert.match(result.text, /STU-0001/)
    assert.match(result.text, /Stored assessment technique.*Consistent.*Stored progress note/)
    assert.equal(result.sidebar, false)
    assert.equal(result.readsBefore, 0)
    assert.equal(result.readsAfter, 1)
    for (const key of ['cardFirst', 'editable', 'fits', 'bounded', 'heightCapped', 'centered', 'focusInside', 'closed', 'focusReturned', 'routeUnchanged', 'sameRoster']) assert.equal(result[key], true, key)
    assert.equal(result.drawerRemains, width < 1024)
    assert.equal(result.writes, 0)
  })
})

test('modal reopening and the full profile reuse the same student query cache', async () => {
  const result = await inCalendar(1280, async (w, wait, ui) => {
    ui.triggers()[0].click(); await wait()
    ui.close(); await wait()
    ui.triggers()[0].click(); await wait()
    const reopened = w.studentDetailReadsFixture.length
    ui.close(); await wait()
    w.history.pushState(null, '', '/instructor/students/00000000-0000-4000-8000-000000000100')
    w.dispatchEvent(new w.PopStateEvent('popstate')); await wait()
    return { reopened, profileReads: w.studentDetailReadsFixture.length, text: w.document.querySelector('main').textContent }
  })
  assert.equal(result.reopened, 1)
  assert.equal(result.profileReads, 1)
  assert.match(result.text, /STU-0001.*Progress checklist/)
})

test('only the checklist scrolls inside a centered modal while the title and Close stay fixed', async () => {
  for (const [width, height] of [[375, 667], [568, 320], [844, 390], [1280, 800]]) {
    const result = await inCalendar(width, async (w, wait, ui) => {
      ui.triggers()[0].click(); await wait()
      const root = ui.root()
      const body = root.querySelector('[aria-label="Progress checklist scroll area"]')
      const header = root.querySelector('[data-slot="dialog-header"]')
      const list = body.querySelector('[data-syllabus-id]').parentElement
      for (let index = 0; index < 30; index++) list.append(list.firstElementChild.cloneNode(true))
      await wait()
      // The dialog fits its content, so measure once the long list is in place.
      const headerBefore = header.getBoundingClientRect()
      body.scrollTop = body.scrollHeight
      const close = [...root.querySelectorAll('button')].find(e => e.textContent.trim() === 'Close progress checklist')
      const bounds = root.getBoundingClientRect(), closeBounds = close.getBoundingClientRect()
      const headerAfter = header.getBoundingClientRect()
      const scrollers = [...root.querySelectorAll('*')].filter(e => ['auto', 'scroll'].includes(w.getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)
      return { bounded: bounds.top >= 0 && bounds.bottom <= w.innerHeight + 1 && bounds.left >= 0 && bounds.right <= w.innerWidth + 1,
        heightCapped: bounds.height <= w.innerHeight * 0.85 + 1,
        centered: Math.abs(bounds.top + bounds.height / 2 - w.innerHeight / 2) < 2,
        scrolled: body.scrollTop > 0, closeVisible: closeBounds.top >= bounds.top && closeBounds.bottom <= bounds.bottom,
        onlyChecklistScrolls: scrollers.length === 1 && scrollers[0] === body,
        headerFixed: headerBefore.top === headerAfter.top && headerBefore.bottom === headerAfter.bottom,
        fits: root.scrollWidth <= root.clientWidth }
    }, '', height)
    assert.deepEqual(result, { bounded: true, heightCapped: true, centered: true, scrolled: true, closeVisible: true,
      onlyChecklistScrolls: true, headerFixed: true, fits: true }, `${width}×${height}`)
  }
})

test('modal detail and checklist errors have independent retry paths and missing profiles stay explicit', async () => {
  for (const mode of ['detail-error', 'grading-signoffs-error']) {
    const result = await inCalendar(390, async (w, wait, ui) => {
      ui.triggers()[0].click(); await wait()
      const root = ui.root()
      const before = root.textContent
      ui.button('Try again').click(); await wait()
      return { before, after: root.textContent }
    }, mode)
    assert.match(result.before, /could not be loaded/)
    assert.match(result.after, /Progress checklist.*Stored assessment technique/)
  }
  const missing = await inCalendar(390, async (w, wait, ui) => {
    ui.triggers()[0].click(); await wait()
    return ui.root().textContent
  }, 'detail-missing')
  assert.match(missing, /Student not found/)
  assert.doesNotMatch(missing, /Stored assessment technique|No emergency contacts/)
})

test('closing a loading modal and choosing another student cannot display the previous response', async () => {
  const result = await inCalendar(390, async (w, wait, ui) => {
    const triggers = ui.triggers()
    triggers[0].click(); await wait(100)
    const loading = ui.root().textContent
    const privateContent = Boolean(ui.root().querySelector('[data-progress-student], [data-syllabus-id]'))
    ui.close(); await wait()
    triggers[1].click(); await wait(2300)
    return { loading, privateContent, text: ui.root().textContent }
  }, 'detail-race')
  assert.match(result.loading, /Loading/)
  assert.equal(result.privateContent, false)
  assert.match(result.text, /STU-0002/)
  assert.doesNotMatch(result.text, /STU-0001/)
})

test('Escape closes only the student modal and restores focus to its speech bubble', async () => {
  const result = await inCalendar(390, async (w, wait, ui) => {
    const trigger = ui.triggers()[0]
    trigger.focus(); trigger.click(); await wait()
    w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
    await wait()
    return { closed: !ui.root(), focusReturned: w.document.activeElement === trigger, drawer: Boolean(w.document.querySelector('[data-slot="drawer-content"]')) }
  })
  assert.deepEqual(result, { closed: true, focusReturned: true, drawer: true })
})

test('changing accounts dismisses the modal and discards late private student responses', async () => {
  const result = await inCalendar(390, async (w, wait, ui) => {
    ui.triggers()[0].click(); await wait(100)
    w.switchInstructorFixture(); await wait(2300)
    return { modal: Boolean(ui.root()), text: w.document.querySelector('main').textContent }
  }, 'detail-race')
  assert.equal(result.modal, false)
  assert.doesNotMatch(result.text, /STU-0001|Primary Guardian|Stored medical alert/)
})
