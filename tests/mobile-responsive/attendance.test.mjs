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
async function inAttendance(width, mode, inspect, role = 'instructor') {
  const result = await request(`/session/${session}/execute/async`, { args: [], script: `
    const done = arguments[arguments.length - 1];
    (async () => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;top:0;left:0;border:0;width:${width}px;height:700px';
      document.body.append(f);
      try {
        await new Promise(resolve => { f.onload = () => setTimeout(resolve, 700); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(${JSON.stringify(`/instructor/calendar?view=day&date=2026-11-27&fixtureData=${mode}&fixtureRole=${role}`)}); });
        const w = f.contentWindow, d = w.document, wait = (ms = 350) => new Promise(resolve => setTimeout(resolve, ms));
        const event = [...d.querySelectorAll('[data-mobile-event], button[aria-label]')].find(e => e.getAttribute('aria-label')?.includes('Mixed/Family'));
        if (event) { event.click(); await wait(); }
        else if (${JSON.stringify(role)} === 'instructor') throw new Error('Class session was not rendered');
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

test('pending attendance shows the optimistic row, disables its toggles and retains mobile control geometry', async () => {
  const result = await inAttendance(320, 'attendance-slow', async (w, wait) => {
    const d = w.document
    const button = () => d.querySelector('[aria-label="Student roster"] [aria-label*=" present"]')
    button().click(); button().click(); await wait(100)
    const pending = { value: button().getAttribute('aria-pressed'), disabled: button().disabled, requests: w.attendanceRequestsFixture.length,
      text: d.querySelector('[data-slot="drawer-content"]').textContent, width: button().getBoundingClientRect().width, height: button().getBoundingClientRect().height }
    await wait(1700)
    return { pending, after: button().getAttribute('aria-pressed'), enabled: !button().disabled, requests: w.attendanceRequestsFixture.length }
  })
  assert.equal(result.pending.value, 'false')
  assert.equal(result.pending.disabled, true)
  assert.equal(result.pending.requests, 1)
  assert.doesNotMatch(result.pending.text, /Saving|Refreshing attendance|verifying|Saved/)
  assert.ok(result.pending.width >= 44 && result.pending.height >= 44)
  assert.equal(result.after, 'false')
  assert.equal(result.enabled, true)
  assert.equal(result.requests, 1)
})

test('the roster stays mounted through a save and its authoritative refresh', async () => {
  const result = await inAttendance(390, 'attendance-refresh-slow', async (w, wait) => {
    const d = w.document
    const list = d.querySelector('[aria-label="Student roster"]')
    const row = list.querySelectorAll('li')[3]
    row.querySelector('[aria-label*=" present"]').click()
    await wait(50)
    const writing = { sameList: d.querySelector('[aria-label="Student roster"]') === list,
      sameRow: d.querySelector('[aria-label="Student roster"] li:nth-child(4)') === row,
      text: d.querySelector('[data-slot="drawer-content"]').textContent }
    await wait(350)
    const refreshing = { sameList: d.querySelector('[aria-label="Student roster"]') === list,
      sameRow: d.querySelector('[aria-label="Student roster"] li:nth-child(4)') === row,
      text: d.querySelector('[data-slot="drawer-content"]').textContent }
    await wait(1500)
    return { writing, refreshing, saved: row.querySelector('[aria-label*=" present"]').getAttribute('aria-pressed') }
  })
  assert.equal(result.writing.sameList && result.writing.sameRow, true)
  assert.doesNotMatch(result.writing.text, /Saving|Refreshing attendance|verifying|Saved/)
  assert.equal(result.refreshing.sameList && result.refreshing.sameRow, true)
  assert.doesNotMatch(result.refreshing.text, /Saving|Refreshing attendance|verifying|Saved/)
  assert.equal(result.saved, 'true')
})

test('the first roster load still displays a skeleton', async () => {
  const result = await inAttendance(390, 'attendance-initial-slow', async (w, wait) => {
    const d = w.document
    const initial = { skeleton: Boolean(d.querySelector('[data-instructor-skeleton="roster"]')),
      rows: d.querySelectorAll('[aria-label="Student roster"] li').length }
    await wait(1500)
    return { initial, rows: d.querySelectorAll('[aria-label="Student roster"] li').length }
  })
  assert.equal(result.initial.skeleton, true)
  assert.equal(result.initial.rows, 0)
  assert.ok(result.rows > 0)
})

test('only affected row toggles lock while other row intents are queued and saved', async () => {
  const result = await inAttendance(320, 'attendance-slow', async (w, wait) => {
    const d = w.document
    const rows = d.querySelectorAll('[aria-label="Student roster"] li')
    const first = rows[0].querySelector('[aria-label*=" absent"]')
    const second = rows[3].querySelector('[aria-label*=" present"]')
    first.click(); await wait(100)
    const otherEnabled = !second.disabled
    second.click(); await wait(100)
    const queued = { firstDisabled: first.disabled, secondDisabled: second.disabled,
      firstSelected: first.getAttribute('aria-pressed'), secondSelected: second.getAttribute('aria-pressed'),
      requests: w.attendanceRequestsFixture.length, mounted: rows[0].isConnected && rows[3].isConnected }
    for (let i = 0; i < 60 && (first.disabled || second.disabled); i++) await wait(100)
    return { otherEnabled, queued, requests: w.attendanceRequestsFixture.length,
      selected: [first.getAttribute('aria-pressed'), second.getAttribute('aria-pressed')],
      hasSuccessLabel: rows[0].textContent.includes('Saved') || rows[3].textContent.includes('Saved'),
      fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth }
  })
  assert.equal(result.otherEnabled, true)
  assert.equal(result.queued.firstDisabled && result.queued.secondDisabled && result.queued.mounted, true)
  assert.equal(result.queued.requests, 1)
  assert.equal(result.queued.firstSelected, 'true')
  assert.equal(result.queued.secondSelected, 'true')
  assert.equal(result.requests, 2)
  assert.deepEqual(result.selected, ['true', 'true'])
  assert.equal(result.hasSuccessLabel, false)
  assert.equal(result.fits, true)
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

test('failed and ambiguously acknowledged saves restore the row and retry the same request without duplicate writes', async () => {
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
    assert.equal(result.before.hidden, false)
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
  assert.equal(result.before.hidden, false)
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

test('unavailable opens a UI-only confirmation and Cancel preserves the selected class', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inAttendance(width, 'attendance-normal', async (w, wait) => {
      const d = w.document, route = w.location.href, roster = d.querySelector('[aria-label="Student roster"]')
      const trigger = [...d.querySelectorAll('button')].find(node => node.textContent.trim() === 'I’m unavailable')
      const triggerHeight = trigger.getBoundingClientRect().height
      trigger.focus(); trigger.click(); await wait()
      const dialog = d.querySelector('[data-slot="alert-dialog-content"]'), bounds = dialog.getBoundingClientRect()
      const confirm = [...dialog.querySelectorAll('button')].find(node => node.textContent === 'Confirm absence')
      const before = { text: dialog.textContent, role: dialog.getAttribute('role'), destructive: confirm.className.includes('text-destructive'), disabled: confirm.disabled, title: d.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent,
        description: d.getElementById(dialog.getAttribute('aria-describedby'))?.textContent, focusInside: dialog.contains(d.activeElement),
        bounded: bounds.left >= 0 && bounds.right <= d.documentElement.clientWidth && bounds.top >= 0 && bounds.bottom <= w.innerHeight,
        fits: dialog.scrollWidth <= dialog.clientWidth, triggerHeight }
      ;[...dialog.querySelectorAll('button')].find(node => node.textContent === 'Cancel').click(); await wait()
      return { ...before, closed: !d.querySelector('[data-slot="alert-dialog-content"]'), focusReturned: d.activeElement === trigger,
        sameRoster: roster === d.querySelector('[aria-label="Student roster"]'), sameRoute: route === w.location.href, requests: w.attendanceRequestsFixture.length }
    })
    assert.equal(result.title, 'Are you sure?')
    assert.equal(result.role, 'alertdialog')
    assert.equal(result.destructive, true)
    assert.equal(result.description, 'Once your absence is marked, an email will be sent out to notify other instructors and the admin.')
    assert.match(result.text, /Mixed\/Family/)
    assert.match(result.text, /No absence will be saved and no email will be sent/)
    assert.equal(result.disabled, true)
    assert.ok(result.triggerHeight >= 44)
    for (const key of ['focusInside', 'bounded', 'fits', 'closed', 'focusReturned', 'sameRoster', 'sameRoute']) assert.equal(result[key], true, key)
    assert.equal(result.requests, 0)
  })
})

test('Escape dismisses unavailable confirmation without closing the class drawer', async () => {
  const result = await inAttendance(390, 'attendance-normal', async (w, wait) => {
    const d = w.document, drawer = d.querySelector('[data-slot="drawer-content"]')
    const trigger = [...d.querySelectorAll('button')].find(node => node.textContent.trim() === 'I’m unavailable')
    trigger.focus(); trigger.click(); await wait()
    d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
    await wait()
    return { closed: !d.querySelector('[data-slot="alert-dialog-content"]'), focusReturned: d.activeElement === trigger,
      sameDrawer: drawer === d.querySelector('[data-slot="drawer-content"]') }
  })
  assert.deepEqual(result, { closed: true, focusReturned: true, sameDrawer: true })
})

test('unavailable is only offered to instructors, not administrators or students', async () => {
  for (const role of ['administrator', 'student']) {
    const count = await inAttendance(390, 'attendance-normal', w => [...w.document.querySelectorAll('button')].filter(node => node.textContent.trim() === 'I’m unavailable').length, role)
    assert.equal(count, 0)
  }
})
