import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173'
const driver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'
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
async function inAttendance(width, mode, inspect) {
  const result = await request(`/session/${session}/execute/async`, { args: [], script: `
    const done = arguments[arguments.length - 1];
    (async () => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;top:0;left:0;border:0;width:${width}px;height:700px';
      document.body.append(f);
      try {
        await new Promise(resolve => { f.onload = () => setTimeout(resolve, 700); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(${JSON.stringify(`/instructor/calendar?view=day&date=2026-11-27&fixtureData=${mode}`)}); });
        const w = f.contentWindow, d = w.document, wait = (ms = 350) => new Promise(resolve => setTimeout(resolve, ms));
        const event = [...d.querySelectorAll('[data-mobile-event], button[aria-label]')].find(e => e.getAttribute('aria-label')?.includes('Mixed/Family'));
        event.click(); await wait();
        done(await (${inspect.toString()})(w, wait, f));
      } catch (error) { done({ error: String(error) }); }
      finally { f.remove(); }
    })();` })
  assert.equal(result?.error, undefined, result?.error)
  return result
}

test('individual present/absent/clear saves persist across drawer reopen and desktop resize', async () => {
  const result = await inAttendance(390, 'attendance-normal', async (w, wait, f) => {
    const d = w.document
    const row = () => d.querySelectorAll('[aria-label="Student roster"] li')[3]
    const present = () => row().querySelector('[aria-label*=" present"]')
    const absent = () => row().querySelector('[aria-label*=" absent"]')
    present().click(); await wait(); const marked = present().getAttribute('aria-pressed')
    present().click(); await wait(); const cleared = [present().getAttribute('aria-pressed'), absent().getAttribute('aria-pressed')]
    absent().click(); await wait(); const markedAbsent = absent().getAttribute('aria-pressed')
    present().click(); await wait()
    d.querySelector('[data-slot="drawer-header"] button').click(); await wait()
    d.querySelector('[data-mobile-event]').click(); await wait()
    const reopened = present().getAttribute('aria-pressed')
    f.style.width = '1280px'; await wait(500)
    return { marked, cleared, markedAbsent, reopened, resized: present().getAttribute('aria-pressed'),
      statuses: w.attendanceRequestsFixture.map(input => input.status), fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth }
  })
  assert.equal(result.marked, 'true')
  assert.deepEqual(result.cleared, ['false', 'false'])
  assert.equal(result.markedAbsent, 'true')
  assert.equal(result.reopened, 'true')
  assert.equal(result.resized, 'true')
  assert.deepEqual(result.statuses, ['present', 'unmarked', 'absent', 'present'])
  assert.equal(result.fits, true)
})

test('pending attendance keeps recorded state, disables double submissions and retains mobile control geometry', async () => {
  const result = await inAttendance(320, 'attendance-slow', async (w, wait) => {
    const d = w.document
    const button = () => d.querySelector('[aria-label="Student roster"] [aria-label*=" present"]')
    button().click(); button().click(); await wait(100)
    const pending = { value: button().getAttribute('aria-pressed'), disabled: button().disabled, requests: w.attendanceRequestsFixture.length,
      text: d.querySelector('[data-slot="drawer-content"]').textContent, width: button().getBoundingClientRect().width, height: button().getBoundingClientRect().height }
    await wait(1700)
    return { pending, after: button().getAttribute('aria-pressed'), enabled: !button().disabled, requests: w.attendanceRequestsFixture.length }
  })
  assert.equal(result.pending.value, 'true')
  assert.equal(result.pending.disabled, true)
  assert.equal(result.pending.requests, 1)
  assert.match(result.pending.text, /Saving attendance/)
  assert.ok(result.pending.width >= 44 && result.pending.height >= 44)
  assert.equal(result.after, 'false')
  assert.equal(result.enabled, true)
  assert.equal(result.requests, 1)
})

test('transactional bulk marking sends all 205 rows and preserves late/excused entries in both directions', async () => {
  const result = await inAttendance(390, 'attendance-large', async (w, wait) => {
    const d = w.document
    const bulk = () => [...d.querySelectorAll('button')].find(e => /Mark All/.test(e.textContent))
    const settled = async () => { for (let i = 0; i < 30; i++) { await wait(100); const button = bulk(); if ((button && !button.disabled) || d.querySelector('[role="alert"]')) break } }
    bulk().click(); await settled()
    const first = { label: bulk().textContent, count: d.querySelectorAll('[aria-label="Student roster"] li').length,
      selected: d.querySelectorAll('[aria-label*=" present"][aria-pressed="true"]').length,
      late: d.querySelectorAll('[aria-label$=": Late"]').length, excused: d.querySelectorAll('[aria-label$=": Excused"]').length }
    bulk().click(); await settled()
    return { first, absent: d.querySelectorAll('[aria-label*=" absent"][aria-pressed="true"]').length,
      lengths: w.attendanceRequestsFixture.map(input => input.expected.length), scopes: w.attendanceRequestsFixture.map(input => input.scope),
      protectedAfter: [d.querySelectorAll('[aria-label$=": Late"]').length, d.querySelectorAll('[aria-label$=": Excused"]').length],
      saveError: d.querySelector('[role="alert"]')?.textContent }
  })
  assert.equal(result.first.label, 'Mark All Absent', JSON.stringify(result))
  assert.equal(result.first.count, 205)
  assert.equal(result.first.selected, 203)
  assert.equal(result.first.late, 1)
  assert.equal(result.first.excused, 1)
  assert.equal(result.absent, 203)
  assert.deepEqual(result.lengths, [205, 205])
  assert.deepEqual(result.scopes, ['roster', 'roster'])
  assert.deepEqual(result.protectedAfter, [1, 1])
})

test('failed and ambiguously acknowledged saves retry the same request without optimistic or duplicate writes', async () => {
  for (const mode of ['attendance-error', 'attendance-lost-response', 'attendance-retry-after-change']) {
    const result = await inAttendance(390, mode, async (w, wait) => {
      const d = w.document
      const present = () => d.querySelector('[aria-label="Student roster"] [aria-label*=" present"]')
      present().click(); await wait()
      const before = { error: d.querySelector('[role="alert"]').textContent, hidden: !present() }
      ;[...d.querySelectorAll('button')].find(e => e.textContent === 'Retry save').click(); await wait()
      return { before, after: present().getAttribute('aria-pressed'), absent: d.querySelector('[aria-label="Student roster"] [aria-label*=" absent"]').getAttribute('aria-pressed'),
        requests: w.attendanceRequestsFixture, hasError: !!d.querySelector('[role="alert"]') }
    })
    assert.equal(result.before.hidden, true)
    assert.equal(result.after, 'false')
    assert.equal(result.hasError, false)
    assert.equal(result.requests.length, 2)
    assert.deepEqual(result.requests[0], result.requests[1])
    if (mode === 'attendance-retry-after-change') assert.equal(result.absent, 'true')
  }
})

test('conflicts require an authoritative reload before a new attendance intent can be submitted', async () => {
  const result = await inAttendance(390, 'attendance-conflict', async (w, wait) => {
    const d = w.document
    const present = () => d.querySelector('[aria-label="Student roster"] [aria-label*=" present"]')
    const absent = () => d.querySelector('[aria-label="Student roster"] [aria-label*=" absent"]')
    present().click(); await wait()
    const before = { error: d.querySelector('[role="alert"]').textContent, hidden: !present(), count: w.attendanceRequestsFixture.length }
    ;[...d.querySelectorAll('button')].find(e => e.textContent === 'Reload attendance').click(); await wait()
    const reloaded = absent().getAttribute('aria-pressed')
    present().click(); await wait()
    return { before, reloaded, requests: w.attendanceRequestsFixture, after: present().getAttribute('aria-pressed') }
  })
  assert.match(result.before.error, /Attendance changed/)
  assert.equal(result.before.hidden, true)
  assert.equal(result.before.count, 1)
  assert.equal(result.reloaded, 'true')
  assert.equal(result.requests.length, 2)
  assert.notEqual(result.requests[0].requestId, result.requests[1].requestId)
  assert.equal(result.requests[1].expected[0].status, 'absent')
  assert.equal(result.after, 'true')
})

test('a successful write followed by a failed read retries only the authoritative reload', async () => {
  const result = await inAttendance(390, 'attendance-postread-error', async (w, wait) => {
    const d = w.document
    d.querySelector('[aria-label="Student roster"] [aria-label*=" present"]').click(); await wait()
    const saveError = d.querySelector('[role="alert"]').textContent
    ;[...d.querySelectorAll('button')].find(e => e.textContent === 'Reload attendance').click(); await wait()
    return { saveError, count: w.attendanceRequestsFixture.length, present: d.querySelector('[aria-label="Student roster"] [aria-label*=" present"]').getAttribute('aria-pressed') }
  })
  assert.match(result.saveError, /Attendance was saved, but the roster could not reload/)
  assert.equal(result.count, 1)
  assert.equal(result.present, 'false')
})

test('cancelled or newly ended sessions become read-only from freshly loaded server metadata', async () => {
  const cancelled = await inAttendance(390, 'attendance-cancelled', w => ({ buttons: w.document.querySelectorAll('[aria-label^="Mark "]').length, requests: w.attendanceRequestsFixture.length }))
  assert.deepEqual(cancelled, { buttons: 0, requests: 0 })
  const ended = await inAttendance(390, 'attendance-ends-during-save', async (w, wait) => {
    const d = w.document
    d.querySelector('[aria-label="Student roster"] [aria-label*=" present"]').click(); await wait()
    const saveError = d.querySelector('[role="alert"]').textContent
    ;[...d.querySelectorAll('button')].find(e => e.textContent === 'Reload attendance').click(); await wait()
    return { saveError, buttons: d.querySelectorAll('[aria-label^="Mark "]').length, count: w.attendanceRequestsFixture.length }
  })
  assert.match(ended.saveError, /read-only/)
  assert.equal(ended.buttons, 0)
  assert.equal(ended.count, 1)
})

test('an old account save response cannot populate the replacement account or selected roster', async () => {
  const result = await inAttendance(390, 'attendance-slow', async (w, wait) => {
    const d = w.document
    d.querySelector('[aria-label="Student roster"] [aria-label*=" present"]').click(); await wait(100)
    w.switchInstructorFixture(); await wait(1800)
    return { rosters: d.querySelectorAll('[aria-label="Student roster"]').length, text: d.querySelector('main').textContent }
  })
  assert.equal(result.rosters, 0)
  assert.doesNotMatch(result.text, /Saving attendance|Unable to save attendance/)
})

test('the persisted fixture read path survives a full document reload', async () => {
  const result = await inAttendance(390, 'attendance-persistence', async (w, wait, f) => {
    let d = w.document
    d.querySelectorAll('[aria-label="Student roster"] li')[3].querySelector('[aria-label*=" present"]').click(); await wait()
    const route = w.location.pathname + w.location.search
    await new Promise(resolve => { f.onload = () => setTimeout(resolve, 700); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(route) })
    d = f.contentDocument
    const value = d.querySelectorAll('[aria-label="Student roster"] li')[3].querySelector('[aria-label*=" present"]').getAttribute('aria-pressed')
    f.contentWindow.sessionStorage.removeItem('test-only-attendance:audit')
    return value
  })
  assert.equal(result, 'true')
})
