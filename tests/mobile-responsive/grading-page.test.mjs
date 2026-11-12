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
    assert.equal(result.path, gradingPath)
    assert.ok(result.heading)
  })
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
    return { message, sameLink: link.isConnected, loaded: !!d.querySelector('main h1') }
  })
  assert.match(result.message, /Roster could not be loaded/)
  assert.equal(result.sameLink, true)
  assert.equal(result.loaded, true)
})

test('grading lists students as columns with sequential roster IDs and only the technique column stays fixed while scrolling', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inPage(width, checklistPath, async (w, wait) => {
      const d = w.document, group = [d.querySelector('main h1')?.textContent, !!d.querySelector('[data-grading-group] [data-track]'), d.querySelector('[data-grading-group] [data-grade-id]')?.dataset.gradeId], selects = d.querySelectorAll('main select').length
      const region = d.querySelector('[aria-label="Grading checklist table"]'), table = region.querySelector('table')
      const allRows = [...table.tBodies[0].rows], header = table.tHead.rows[0]
      const rows = allRows.filter(row => row.querySelector('input[type="checkbox"]'))
      const categoryRows = allRows.filter(row => row.hasAttribute('data-category-row')).map(row => row.cells[0].textContent.trim())
      const before = { id: rows[0].cells[0].getBoundingClientRect().x, name: rows[0].cells[1].getBoundingClientRect().x }
      region.scrollLeft = 120; await wait(50)
      const scroll = region.scrollLeft
      const after = { id: rows[0].cells[0].getBoundingClientRect().x, name: rows[0].cells[1].getBoundingClientRect().x }
      const idsOf = () => [...d.querySelectorAll('thead [data-candidate-number]')].map(node => node.textContent.trim())
      const ids = idsOf()
      const stickyColumns = [...table.rows].map(row => [...row.cells].flatMap((cell, index) => w.getComputedStyle(cell).position === 'sticky' ? [index] : []))
      const checkbox = rows[0].querySelector('input[type="checkbox"]'); checkbox.click(); await wait(50)
      ;[...d.querySelectorAll('button')].find(node => node.textContent === 'Save draft').click(); await wait(500)
      return { headers: [...header.cells].map(cell => cell.textContent.trim()), ids, stickyColumns, before, after, scroll, group, selects,
        unchecked: !checkbox.checked, rowHeaders: allRows.map(row => row.cells[0].textContent.trim()), categoryRows,
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
    assert.equal(result.unchecked, true)
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
    d.querySelector('tbody input').click(); await wait(30)
    saveDraft.afterChange = hasSaveDraft()
    const comment = d.querySelector('tbody textarea')
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(comment, 'Good progress')
    comment.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(30)
    const cleanUi = !d.querySelector('main').textContent.includes('Unsaved changes. Save your draft before changing track or grade.')
      && ![...d.querySelectorAll('button')].some(node => node.textContent.includes('Reload saved version'))
    const save = [...d.querySelectorAll('button')].find(node => node.textContent === 'Save draft')
    save.click(); save.click(); await wait(500)
    saveDraft.afterSave = hasSaveDraft()
    const requests = w.gradingBatchRequestsFixture.map(r => ({ cells: r.cells.length, unchecked: r.cells.filter(c => !c.checked).length, submit: r.submit, comments: r.comments.map(c => c.notes) }))
    const savedText = d.querySelector('main').textContent
    const route = w.location.pathname + w.location.search
    w.location.href = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(route)
    await wait(1000); d = w.document
    const value = d.querySelector('tbody input').checked, text = d.querySelector('main').textContent, restoredComment = d.querySelector('tbody textarea').value
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
  assert.deepEqual(result.requests, [{ cells: 4, unchecked: 1, submit: false, comments: ['Good progress', null, null, null] }])
  assert.equal(result.restoredComment, 'Good progress')
  assert.doesNotMatch(result.savedText, /Your draft has been saved|New draft|Your draft · Version/)
  assert.equal(result.value, false)
  assert.doesNotMatch(result.text, /New draft|Your draft · Version/)
  assert.deepEqual(result.group,["Children's grading",false,'stored-target-grade'])
  assert.match(result.footer.text,/Last saved:/)
  assert.ok(result.footer.datetime)
  assert.equal(result.footer.below,true)
})

test('submitted grading automatically resumes, stays editable and supports draft saves and re-signing', async () => {
  const result = await inPage(390, `${checklistPath}&fixtureData=batch-persistence`, async (w, wait) => {
    let d = w.document
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
    const emptyDisabled = await sign()
    const after = { text: d.querySelector('main').textContent, editable: [...d.querySelectorAll('tbody input')].every(node => !node.disabled),
      dialogClosed: !d.querySelector('[data-slot="dialog-content"]'), timestamp: d.querySelector('[data-grading-timestamp]').textContent }
    const route = w.location.pathname + w.location.search
    w.location.href = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(route)
    await wait(1000); d = w.document
    const resumed = { group: [d.querySelector('main h1')?.textContent, !!d.querySelector('[data-grading-group] [data-track]'), d.querySelector('[data-grading-group] [data-grade-id]')?.dataset.gradeId], editable: !d.querySelector('tbody input').disabled,
      timestamp: d.querySelector('[data-grading-timestamp]').textContent,
      versionLabelAbsent: !d.querySelector('main').textContent.includes('Your submitted grading · Version') }
    d.querySelector('tbody input').click(); await wait(30)
    ;[...d.querySelectorAll('button')].find(node => node.textContent === 'Save draft').click(); await wait(500)
    const edited = { value: d.querySelector('tbody input').checked, timestamp: d.querySelector('[data-grading-timestamp]').textContent,
      request: w.gradingBatchRequestsFixture[0] }
    const signatureRequiredAgain = await sign()
    const resubmitted = { value: d.querySelector('tbody input').checked, timestamp: d.querySelector('[data-grading-timestamp]').textContent,
      request: w.gradingBatchRequestsFixture[1] }
    w.sessionStorage.removeItem('test-only-grading-batches:audit')
    w.switchInstructorFixture(); await wait(1200)
    return { emptyDisabled, after, resumed, edited, signatureRequiredAgain, resubmitted, ownDraft: d.querySelector('main').textContent, editable: !d.querySelector('tbody input').disabled }
  })
  assert.equal(result.emptyDisabled, true)
  assert.equal(result.after.editable, true)
  assert.equal(result.after.dialogClosed, true)
  assert.match(result.after.timestamp,/Last submitted:/)
  assert.doesNotMatch(result.after.text, /grading batch has been submitted|New draft|Your draft · Version/)
  assert.deepEqual(result.resumed.group,["Children's grading",false,'stored-target-grade'])
  assert.equal(result.resumed.editable,true)
  assert.equal(result.resumed.versionLabelAbsent,true)
  assert.match(result.resumed.timestamp,/Last submitted:/)
  assert.equal(result.edited.value,false)
  assert.match(result.edited.timestamp,/Last saved:/)
  assert.equal(result.edited.request.signature,null)
  assert.equal(result.edited.request.expectedVersion,1)
  assert.equal(result.signatureRequiredAgain,true)
  assert.equal(result.resubmitted.value,false)
  assert.match(result.resubmitted.timestamp,/Last submitted:/)
  assert.equal(result.resubmitted.request.expectedVersion,2)
  assert.ok(result.resubmitted.request.signature.strokes.length)
  assert.doesNotMatch(result.ownDraft, /New draft|Your draft · Version/)
  assert.equal(result.editable, true)
})

test('lost grading save responses retry the exact request without duplicate drafts', async () => {
  const result = await inPage(390, `${checklistPath}&fixtureData=batch-lost-response`, async (w, wait) => {
    const d = w.document
    d.querySelector('tbody input').click(); await wait(30)
    ;[...d.querySelectorAll('button')].find(node => node.textContent === 'Save draft').click(); await wait(500)
    const error = d.querySelector('[role="alert"]').textContent, locked = d.querySelector('tbody input').disabled
    ;[...d.querySelectorAll('button')].find(node => node.textContent === 'Retry draft save').click(); await wait(500)
    return { message: error, locked, requests: w.gradingBatchRequestsFixture, text: d.querySelector('main').textContent, value: d.querySelector('tbody input').checked }
  })
  assert.match(result.message, /response was lost/)
  assert.equal(result.locked, true)
  assert.equal(result.requests.length, 2)
  assert.deepEqual(result.requests[0], result.requests[1])
  assert.match(result.text, /Last saved:/)
  assert.equal(result.value, false)
})

test('grading conflicts keep local edits and explain page refresh without a reload button', async () => {
  const result = await inPage(390, `${checklistPath}&fixtureData=batch-conflict`, async (w, wait) => {
    const d = w.document
    const save = () => [...d.querySelectorAll('button')].find(node => node.textContent === 'Save draft')
    const [first, second] = d.querySelectorAll('tbody input[type="checkbox"]')
    first.click(); await wait(30); save().click(); await wait(500)
    second.click(); await wait(30); save().click(); await wait(500)
    const local = second.checked, message = d.querySelector('[role="alert"]').textContent
    return { local, message, locked: d.querySelector('tbody input').disabled,
      reloadButton: [...d.querySelectorAll('button')].some(node => node.textContent.includes('Reload saved version')) }
  })
  assert.equal(result.local, false)
  assert.match(result.message, /changed in another tab/)
  assert.match(result.message, /Refresh the page/)
  assert.equal(result.locked, true)
  assert.equal(result.reloadButton, false)
})
