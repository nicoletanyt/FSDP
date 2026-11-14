import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173'
const driver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'
const gradingId = '00000000-0000-4000-8000-202611070008'
const gradingPath = `/instructor/grading/${gradingId}`
// The grading day links each session's checklist with ?session= (the fixture's one sorted session).
const checklistPath = `${gradingPath}?session=00000000-0000-4000-8000-000000000901`
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

async function inPage(width, route, inspect, delay = 700) {
  const result = await request(`/session/${session}/execute/async`, { args: [], script: `
    const done = arguments[arguments.length - 1];
    (async () => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;top:0;left:0;border:0;width:${width}px;height:800px';
      document.body.append(f);
      try {
        await new Promise(resolve => { f.onload = () => setTimeout(resolve, ${delay}); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(${JSON.stringify(route)}); });
        const wait = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));
        done(await (${inspect.toString()})(f.contentWindow, wait));
      } catch (error) { done({ error: String(error) }); }
      finally { f.remove(); }
    })();` })
  assert.equal(result?.error, undefined, result?.error)
  return result
}

test('View Grading fills its container with more space above and opens the grading session', async t => {
  for (const width of [390, 1440]) await t.test(`${width}px`, async () => {
    const result = await inPage(width, `/instructor/calendar?view=month&date=2026-11-7&session=${gradingId}`, async (w, wait) => {
      const link = [...w.document.querySelectorAll('a')].find(node => node.textContent.trim() === 'View Grading')
      const parent = link.parentElement, style = w.getComputedStyle(parent)
      const available = parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const measured = { width: link.getBoundingClientRect().width, available, height: link.getBoundingClientRect().height, topSpace: parseFloat(style.paddingTop) }
      link.click(); await wait()
      return { ...measured, path: w.location.pathname, heading: w.document.querySelector('main h1')?.textContent }
    })
    assert.ok(Math.abs(result.width - result.available) < 1)
    assert.ok(result.height >= 44)
    assert.ok(result.topSpace >= 16)
    assert.match(result.path, new RegExp(`^/instructor/(gradings/${gradingId}|grading/session/[0-9a-f-]{36})$`))
    assert.ok(result.heading)
  })
})

test('View Grading opens the session checklist page, which goes back to that calendar view', async () => {
  // Timed sessions: the calendar links straight to the session's checklist page.
  const calendar = '/instructor/calendar?view=day&date=2026-11-7&fixtureData=grading-sessions'
  const timed = await inPage(390, calendar, async (w, wait) => {
    const d = w.document
    ;[...d.querySelectorAll('button[aria-label]')].find(node => node.getAttribute('aria-label').startsWith('Session 1 · Children Grading')
      && node.getAttribute('aria-label').endsWith('View details')).click(); await wait(900)
    // Selecting the session adds it to the calendar URL; that exact view is where Back returns.
    const from = `${w.location.pathname}${w.location.search}`
    ;[...d.querySelectorAll('a')].find(node => node.textContent.trim() === 'View Grading').click(); await wait(1500)
    const back = [...d.querySelectorAll('main a')].find(node => /^Back to/.test(node.textContent.trim()))
    const landed = { path: w.location.pathname, label: back?.textContent.trim(), href: back?.getAttribute('href'),
      checklist: !!d.querySelector('[data-mark]') }
    back?.click(); await wait()
    return { from, landed, returned: `${w.location.pathname}${w.location.search}` }
  })
  assert.ok(timed.from.startsWith(calendar))
  assert.equal(timed.landed.path, '/instructor/grading/session/00000000-0000-4000-8000-000000000901')
  assert.equal(timed.landed.checklist, true)
  assert.equal(timed.landed.label, 'Back to calendar')
  assert.equal(timed.landed.href, timed.from)
  assert.equal(timed.returned, timed.from)
  // Without timed sessions it opens the grading day, whose View checklist leads to the session page.
  const untimed = `/instructor/calendar?view=month&date=2026-11-7&session=${gradingId}`
  const day = await inPage(390, untimed, async (w, wait) => {
    const d = w.document
    ;[...d.querySelectorAll('a')].find(node => node.textContent.trim() === 'View Grading').click(); await wait(1200)
    const back = [...d.querySelectorAll('main a')].find(node => /^Back to/.test(node.textContent.trim()))
    const landed = { path: w.location.pathname, label: back?.textContent.trim(), href: back?.getAttribute('href') }
    ;[...d.querySelectorAll('main a')].find(node => /^View checklist/.test(node.textContent.trim())).click(); await wait(1200)
    const sessionBack = [...d.querySelectorAll('main a')].find(node => /^Back to/.test(node.textContent.trim()))
    return { landed, session: { path: w.location.pathname, label: sessionBack?.textContent.trim(), href: sessionBack?.getAttribute('href') } }
  })
  assert.equal(day.landed.path, `/instructor/gradings/${gradingId}`)
  assert.equal(day.landed.label, 'Back to calendar')
  assert.equal(day.landed.href, untimed)
  assert.match(day.session.path, /^\/instructor\/grading\/session\/[0-9a-f-]{36}$/)
  assert.equal(day.session.label, 'Back to grading sessions')
  assert.equal(day.session.href, `/instructor/gradings/${gradingId}`)
  // The old URL redirects to the session page, keeping its other parameters.
  const legacy = await inPage(390, `${gradingPath}?session=00000000-0000-4000-8000-000000000901&fixtureData=grading-endorsed`, async (w, wait) => {
    await wait(1200)
    return `${w.location.pathname}${w.location.search}`
  })
  assert.equal(legacy, '/instructor/grading/session/00000000-0000-4000-8000-000000000901?fixtureData=grading-endorsed')
})

test('grading skeleton fits the page and keeps the same back link after loading', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inPage(width, `${gradingPath}?fixtureData=attendance-initial-slow`, async (w, wait) => {
      const d = w.document, skeleton = d.querySelector('[data-instructor-skeleton="grading"]')
      const link = [...d.querySelectorAll('main a')].find(node => node.textContent.trim() === 'Back to calendar')
      const before = link.getBoundingClientRect(), className = link.className
      const loading = { busy: skeleton?.getAttribute('aria-busy'), bars: skeleton?.querySelectorAll('[data-slot="skeleton"]').length,
        fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth, height: before.height }
      await wait(1700)
      const after = link.getBoundingClientRect()
      return { loading, sameLink: link.isConnected, sameStyle: link.className === className,
        samePosition: before.x === after.x && before.y === after.y,
        loaded: !d.querySelector('[data-instructor-skeleton]') && !!d.querySelector('main h1'), href: link.getAttribute('href'),
        fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth }
    }, 100)
    assert.equal(result.loading.busy, 'true')
    assert.ok(result.loading.bars >= 8)
    assert.ok(result.loading.height >= 44)
    assert.equal(result.loading.fits, true)
    assert.equal(result.sameLink, true)
    assert.equal(result.sameStyle, true)
    assert.equal(result.samePosition, true)
    assert.equal(result.loaded, true)
    assert.equal(result.fits, true)
    assert.match(result.href, /\/instructor\/calendar\?.*session=/)
  })
})

test('grading load errors retain calendar navigation and retry successfully', async () => {
  const result = await inPage(390, `${gradingPath}?fixtureData=roster-error`, async (w, wait) => {
    const d = w.document, link = d.querySelector('main a'), message = d.querySelector('[role="alert"]').textContent
    ;[...d.querySelectorAll('main button')].find(node => node.textContent === 'Try again').click()
    await wait()
    // A successful retry moves to the session's URL, so the back link is re-rendered rather than the same node.
    const after = [...d.querySelectorAll('main a')].find(node => /^Back to/.test(node.textContent.trim()))
    return { message, hadLink: !!link, backLink: !!after, loaded: !!d.querySelector('main h1') }
  })
  assert.match(result.message, /Roster could not be loaded/)
  assert.equal(result.hadLink, true)
  assert.equal(result.backLink, true)
  assert.equal(result.loaded, true)
})

test('grading lists students as columns with sequential roster IDs and only the technique column stays fixed while scrolling', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inPage(width, checklistPath, async (w, wait) => {
      const d = w.document, group = [d.querySelector('main h1')?.textContent, !!d.querySelector('[data-grading-group] [data-track]'), d.querySelector('[data-grading-group] [data-grade-id]')?.dataset.gradeId], selects = d.querySelectorAll('main select').length
      const region = d.querySelector('[aria-label="Grading checklist table"]'), table = region.querySelector('table')
      const allRows = [...table.tBodies[0].rows], header = table.tHead.rows[0]
      const rows = allRows.filter(row => row.querySelector('[data-mark]'))
      const categoryRows = allRows.filter(row => row.hasAttribute('data-category-row')).map(row => row.cells[0].textContent.trim())
      const before = { id: rows[0].cells[0].getBoundingClientRect().x, name: rows[0].cells[1].getBoundingClientRect().x }
      region.scrollLeft = 120; await wait(50)
      const scroll = region.scrollLeft
      const after = { id: rows[0].cells[0].getBoundingClientRect().x, name: rows[0].cells[1].getBoundingClientRect().x }
      const idsOf = () => [...d.querySelectorAll('thead [data-candidate-number]')].map(node => node.textContent.trim())
      const ids = idsOf()
      const stickyColumns = [...table.rows].map(row => [...row.cells].flatMap((cell, index) => w.getComputedStyle(cell).position === 'sticky' ? [index] : []))
      const marker = rows[0].querySelector('[data-mark]'); marker.querySelector('button').click(); await wait(50)
      ;[...d.querySelectorAll('button')].find(node => node.textContent === 'Save draft').click(); await wait(500)
      return { headers: [...header.cells].map(cell => cell.textContent.trim()), ids, stickyColumns, before, after, scroll, group, selects,
        marked: marker.dataset.mark, rowHeaders: allRows.map(row => row.cells[0].textContent.trim()), categoryRows,
        fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth }
    })
    assert.deepEqual(result.group, ["Children's grading", false, 'stored-target-grade'])
    assert.equal(result.selects, 0)
    assert.equal(result.headers[0], 'Technique')
    assert.equal(result.headers.length, result.ids.length + 1)
    assert.equal(result.rowHeaders.at(-1), 'Comments')
    // Each category is named once, in its own row, not on every technique.
    assert.ok(result.categoryRows.length > 0)
    assert.equal(new Set(result.categoryRows).size, result.categoryRows.length)
    assert.ok(result.ids.length > 0)
    assert.deepEqual(result.ids, result.ids.map((_, index) => String(index + 1)))
    assert.ok(result.stickyColumns.every(columns => columns.length === 1 && columns[0] === 0))
    if (width <= 390) {
      assert.ok(result.scroll > 0)
      assert.ok(Math.abs(result.before.id - result.after.id) <= 1)
      assert.ok(result.after.name < result.before.name)
    }
    assert.equal(result.marked, 'A')
    assert.equal(result.fits, true)
  })
})

test('a checklist link without a session opens the day\'s only session, with no filters', async () => {
  const result = await inPage(390, gradingPath, async (w) => {
    const d = w.document, main = d.querySelector('main')
    return { selects: main.querySelectorAll('select').length, table: !!main.querySelector('table'),
      session: main.querySelector('[data-session-label]')?.textContent }
  })
  assert.equal(result.selects, 0)
  assert.equal(result.table, true)
  assert.equal(result.session, 'Session 1')
})

test('grading drafts save the complete matrix and survive a document reload', async () => {
  const result = await inPage(390, `${checklistPath}&fixtureData=batch-persistence`, async (w, wait) => {
    let d = w.document
    const hasSaveDraft = () => [...d.querySelectorAll('button')].some(node => node.textContent === 'Save draft')
    const submit = d.querySelector('[data-submit-grading]'), green = w.getComputedStyle(submit).backgroundColor
    const probe = d.createElement('span'); probe.className = 'bg-success'; d.body.append(probe)
    const success = w.getComputedStyle(probe).backgroundColor; probe.remove()
    const saveDraft = { initially: hasSaveDraft() }
    d.querySelector('tbody [data-mark] button').click(); await wait(30)
    saveDraft.afterChange = hasSaveDraft()
    const comment = d.querySelector('tbody textarea')
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(comment, 'Good progress')
    comment.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(30)
    const cleanUi = !d.querySelector('main').textContent.includes('Unsaved changes. Save your draft before changing track or grade.')
      && ![...d.querySelectorAll('button')].some(node => node.textContent.includes('Reload saved version'))
    const save = [...d.querySelectorAll('button')].find(node => node.textContent === 'Save draft')
    save.click(); save.click(); await wait(500)
    saveDraft.afterSave = hasSaveDraft()
    const requests = w.gradingBatchRequestsFixture.map(r => ({ cells: r.cells.length, marks: r.cells.map(c => c.grade), submit: r.submit, comments: r.comments.map(c => c.notes) }))
    const savedText = d.querySelector('main').textContent
    const route = w.location.pathname + w.location.search
    w.location.href = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(route)
    await wait(1000); d = w.document
    const value = d.querySelector('tbody [data-mark]').dataset.mark, text = d.querySelector('main').textContent, restoredComment = d.querySelector('tbody textarea').value
    const group = [d.querySelector('main h1')?.textContent, !!d.querySelector('[data-grading-group] [data-track]'), d.querySelector('[data-grading-group] [data-grade-id]')?.dataset.gradeId]
    const timestamp = d.querySelector('[data-grading-timestamp]')
    const footer = { text: timestamp.textContent, datetime: timestamp.querySelector('time').dateTime,
      below: timestamp.getBoundingClientRect().top >= d.querySelector('table').getBoundingClientRect().bottom }
    w.sessionStorage.removeItem('test-only-grading-batches:audit')
    return { saveDraft, submitColour: { green, success }, cleanUi, requests, savedText, value, text, group, footer, restoredComment }
  })
  assert.deepEqual(result.saveDraft, { initially: false, afterChange: true, afterSave: false })
  assert.equal(result.submitColour.green, result.submitColour.success)
  assert.equal(result.cleanUi, true)
  // Cells start blank; the one chosen letter is saved and the rest stay blank in the draft.
  assert.deepEqual(result.requests, [{ cells: 4, marks: ['A', null, null, null], submit: false, comments: ['Good progress', null, null, null] }])
  assert.equal(result.restoredComment, 'Good progress')
  assert.doesNotMatch(result.savedText, /Your draft has been saved|New draft|Your draft · Version/)
  assert.equal(result.value, 'A')
  assert.doesNotMatch(result.text, /New draft|Your draft · Version/)
  assert.deepEqual(result.group,["Children's grading",false,'stored-target-grade'])
  assert.match(result.footer.text,/Last saved:/)
  assert.ok(result.footer.datetime)
  assert.equal(result.footer.below,true)
})

test('submitted grading automatically resumes, stays editable and supports draft saves and re-signing', async () => {
  const result = await inPage(390, `${checklistPath}&fixtureData=batch-persistence`, async (w, wait) => {
    let d = w.document
    // Submitting needs every present candidate's techniques marked.
    const markAll = async () => {
      for (const marker of d.querySelectorAll('tbody [data-mark]')) if (!marker.dataset.mark && !marker.querySelector('button').disabled) marker.querySelector('button').click()
      await wait(30)
    }
    const sign = async () => {
      ;[...d.querySelectorAll('button')].find(node => node.textContent === 'Submit grading').click(); await wait()
      const canvas = d.querySelector('canvas'), bounds = canvas.getBoundingClientRect()
      const confirm = [...d.querySelectorAll('[data-slot="dialog-content"] button')].find(node => node.textContent === 'Confirm and submit')
      const emptyDisabled = confirm.disabled
      canvas.setPointerCapture = () => {}; canvas.hasPointerCapture = () => false
      for (const [type, x] of [['pointerdown', 20], ['pointermove', 40], ['pointerup', 60]]) canvas.dispatchEvent(new w.PointerEvent(type, {
        bubbles: true, pointerId: 1, isPrimary: true, button: 0, clientX: bounds.left + x, clientY: bounds.top + 30,
      }))
      await wait(50); confirm.click(); confirm.click(); await wait(500)
      return emptyDisabled
    }
    const blocked = d.querySelector('[data-submit-grading]').disabled
    await markAll()
    const emptyDisabled = await sign()
    const after = { text: d.querySelector('main').textContent, editable: [...d.querySelectorAll('tbody [data-mark] button')].every(node => !node.disabled),
      dialogClosed: !d.querySelector('[data-slot="dialog-content"]'), timestamp: d.querySelector('[data-grading-timestamp]').textContent }
    const route = w.location.pathname + w.location.search
    w.location.href = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(route)
    await wait(1000); d = w.document
    const resumed = { group: [d.querySelector('main h1')?.textContent, !!d.querySelector('[data-grading-group] [data-track]'), d.querySelector('[data-grading-group] [data-grade-id]')?.dataset.gradeId], editable: !d.querySelector('tbody [data-mark] button').disabled,
      timestamp: d.querySelector('[data-grading-timestamp]').textContent,
      versionLabelAbsent: !d.querySelector('main').textContent.includes('Your submitted grading · Version') }
    // Change one mark from A to B, then save a draft.
    d.querySelector('tbody [data-mark] button:nth-child(2)').click(); await wait(30)
    ;[...d.querySelectorAll('button')].find(node => node.textContent === 'Save draft').click(); await wait(500)
    const edited = { value: d.querySelector('tbody [data-mark]').dataset.mark, timestamp: d.querySelector('[data-grading-timestamp]').textContent,
      request: w.gradingBatchRequestsFixture[0] }
    const signatureRequiredAgain = await sign()
    const resubmitted = { value: d.querySelector('tbody [data-mark]').dataset.mark, timestamp: d.querySelector('[data-grading-timestamp]').textContent,
      request: w.gradingBatchRequestsFixture[1] }
    w.sessionStorage.removeItem('test-only-grading-batches:audit')
    w.switchInstructorFixture(); await wait(1200)
    return { blocked, emptyDisabled, after, resumed, edited, signatureRequiredAgain, resubmitted, ownDraft: d.querySelector('main').textContent, editable: !d.querySelector('tbody [data-mark] button').disabled }
  })
  assert.equal(result.blocked, true, 'Submit is disabled until every technique is marked')
  assert.equal(result.emptyDisabled, true)
  assert.equal(result.after.editable, true)
  assert.equal(result.after.dialogClosed, true)
  assert.match(result.after.timestamp,/Last submitted:/)
  assert.doesNotMatch(result.after.text, /grading batch has been submitted|New draft|Your draft · Version/)
  assert.deepEqual(result.resumed.group,["Children's grading",false,'stored-target-grade'])
  assert.equal(result.resumed.editable,true)
  assert.equal(result.resumed.versionLabelAbsent,true)
  assert.match(result.resumed.timestamp,/Last submitted:/)
  assert.equal(result.edited.value,'B')
  assert.match(result.edited.timestamp,/Last saved:/)
  assert.equal(result.edited.request.signature,null)
  assert.equal(result.edited.request.expectedVersion,1)
  assert.equal(result.signatureRequiredAgain,true)
  assert.equal(result.resubmitted.value,'B')
  assert.match(result.resubmitted.timestamp,/Last submitted:/)
  assert.equal(result.resubmitted.request.expectedVersion,2)
  assert.ok(result.resubmitted.request.signature.strokes.length)
  assert.doesNotMatch(result.ownDraft, /New draft|Your draft · Version/)
  assert.equal(result.editable, true)
})

test('lost grading save responses retry the exact request without duplicate drafts', async () => {
  const result = await inPage(390, `${checklistPath}&fixtureData=batch-lost-response`, async (w, wait) => {
    const d = w.document
    d.querySelector('tbody [data-mark] button').click(); await wait(30)
    ;[...d.querySelectorAll('button')].find(node => node.textContent === 'Save draft').click(); await wait(500)
    const error = d.querySelector('[role="alert"]').textContent, locked = d.querySelector('tbody [data-mark] button').disabled
    ;[...d.querySelectorAll('button')].find(node => node.textContent === 'Retry draft save').click(); await wait(500)
    return { message: error, locked, requests: w.gradingBatchRequestsFixture, text: d.querySelector('main').textContent, value: d.querySelector('tbody [data-mark]').dataset.mark }
  })
  assert.match(result.message, /response was lost/)
  assert.equal(result.locked, true)
  assert.equal(result.requests.length, 2)
  assert.deepEqual(result.requests[0], result.requests[1])
  assert.match(result.text, /Last saved:/)
  assert.equal(result.value, 'A')
})

test('grading conflicts keep local edits and explain page refresh without a reload button', async () => {
  const result = await inPage(390, `${checklistPath}&fixtureData=batch-conflict`, async (w, wait) => {
    const d = w.document
    const save = () => [...d.querySelectorAll('button')].find(node => node.textContent === 'Save draft')
    const [first, second] = d.querySelectorAll('tbody [data-mark]')
    first.querySelector('button:nth-child(2)').click(); await wait(30); save().click(); await wait(500)
    second.querySelector('button:nth-child(2)').click(); await wait(30); save().click(); await wait(500)
    const local = second.dataset.mark, message = d.querySelector('[role="alert"]').textContent
    return { local, message, locked: d.querySelector('tbody [data-mark] button').disabled,
      reloadButton: [...d.querySelectorAll('button')].some(node => node.textContent.includes('Reload saved version')) }
  })
  assert.equal(result.local, 'B', 'the unsaved local mark is kept')
  assert.match(result.message, /changed in another tab/)
  assert.match(result.message, /Refresh the page/)
  assert.equal(result.locked, true)
  assert.equal(result.reloadButton, false)
})

test('absent candidates are hidden from the checklist until the "Show absent" switch is on, then shown disabled', async () => {
  const result = await inPage(390, checklistPath, async (w, wait) => {
    const d = w.document
    const columns = () => [...d.querySelectorAll('thead th[scope="col"]')].slice(1).map(cell => {
      const pill = cell.querySelector('[data-absent]'), id = cell.querySelector('[data-candidate-number]')
      return { id: id?.textContent.trim(), absent: !!pill, pillIcon: !!pill?.querySelector('svg'),
        pillAboveId: Boolean(pill && id && (pill.compareDocumentPosition(id) & 4)), disabled: cell.dataset.disabled === 'true' }
    })
    const toggle = d.querySelector('[data-show-absent] [role="switch"]')
    const hidden = { columns: columns(), label: d.querySelector('[data-show-absent]')?.textContent.trim(), checked: toggle?.getAttribute('aria-checked') }
    toggle.click(); await wait(100)
    const absentIndex = columns().findIndex(column => column.absent)
    const body = [...d.querySelector('tbody').rows].filter(row => row.querySelector('[data-mark], textarea'))
    const inputs = body.flatMap(row => [...row.cells[absentIndex + 1].querySelectorAll('button, textarea')])
    const shown = { columns: columns(), checked: toggle.getAttribute('aria-checked'), inputsDisabled: inputs.length > 0 && inputs.every(input => input.disabled),
      othersEnabled: body.every(row => [...row.cells].slice(1).filter((_, index) => index !== absentIndex).every(cell => !cell.querySelector('button, textarea')?.disabled)) }
    d.querySelector('[data-show-absent]').click(); await wait(100)
    return { hidden, shown, rehidden: columns().length }
  })
  assert.equal(result.hidden.label, 'Show absent (1)')
  assert.equal(result.hidden.checked, 'false')
  assert.ok(result.hidden.columns.every(column => !column.absent), JSON.stringify(result.hidden))
  assert.equal(result.shown.checked, 'true')
  assert.equal(result.shown.columns.length, result.hidden.columns.length + 1)
  const absent = result.shown.columns.filter(column => column.absent)
  assert.deepEqual(absent.map(({ pillIcon, pillAboveId, disabled }) => ({ pillIcon, pillAboveId, disabled })), [{ pillIcon: true, pillAboveId: true, disabled: true }])
  assert.equal(result.shown.inputsDisabled, true)
  assert.equal(result.shown.othersEnabled, true)
  // Clicking the label text toggles the switch off again.
  assert.equal(result.rehidden, result.hidden.columns.length)
})

test('endorsed candidates show an endorsed icon; clicking it shows who endorsed and when', async () => {
  const result = await inPage(1440, `${checklistPath}&fixtureData=grading-endorsed`, async (w, wait) => {
    const d = w.document
    await wait(300)
    const headers = [...d.querySelectorAll('thead th[scope="col"]')].slice(1)
    const icons = headers.map(cell => !!cell.querySelector('[data-endorsed]'))
    const closed = !d.querySelector('[data-endorsement-details]')
    headers[0].querySelector('[data-endorsed]').click(); await wait(300)
    const details = d.querySelector('[data-endorsement-details]')
    return { icons, closed, by: details?.querySelector('[data-endorsed-by]')?.textContent.trim() ?? null,
      at: details?.querySelector('[data-endorsed-at]')?.getAttribute('datetime') ?? null,
      atText: details?.querySelector('[data-endorsed-at]')?.textContent.trim() ?? null }
  })
  assert.deepEqual(result.icons, [true, ...result.icons.slice(1).map(() => false)])
  assert.equal(result.closed, true)
  assert.equal(result.by, 'Fixture Sensei')
  assert.equal(result.at, '2026-11-13T02:00:00Z')
  // Shown in Singapore time with the time of day.
  assert.match(result.atText ?? '', /13 Nov 2026.*10:00/)
})
