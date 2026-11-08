import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173'
const driver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'
const gradingId = '00000000-0000-4000-8000-202611070008'
const gradingPath = `/instructor/grading/${gradingId}`
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

test('grading assigns sequential roster IDs and only the ID column stays fixed while scrolling', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inPage(width, gradingPath, async (w, wait) => {
      const d = w.document, [track, grade] = d.querySelectorAll('main select')
      track.value = 'children'; track.dispatchEvent(new w.Event('change', { bubbles: true })); await wait()
      grade.value = 'stored-target-grade'; grade.dispatchEvent(new w.Event('change', { bubbles: true })); await wait()
      const region = d.querySelector('[aria-label="Grading checklist table"]'), table = region.querySelector('table')
      const rows = [...table.tBodies[0].rows], header = table.tHead.rows[0]
      const before = { id: rows[0].cells[0].getBoundingClientRect().x, name: rows[0].cells[1].getBoundingClientRect().x }
      region.scrollLeft = 120; await wait(50)
      const scroll = region.scrollLeft
      const after = { id: rows[0].cells[0].getBoundingClientRect().x, name: rows[0].cells[1].getBoundingClientRect().x }
      const ids = rows.map(row => row.cells[0].textContent.trim())
      const stickyColumns = [...table.rows].map(row => [...row.cells].flatMap((cell, index) => w.getComputedStyle(cell).position === 'sticky' ? [index] : []))
      const checkbox = rows[0].querySelector('input[type="checkbox"]'); checkbox.click(); await wait(50)
      track.value = 'adult'; track.dispatchEvent(new w.Event('change', { bubbles: true })); await wait()
      grade.value = 'stored-target-grade'; grade.dispatchEvent(new w.Event('change', { bubbles: true })); await wait()
      return { headers: [...header.cells].map(cell => cell.textContent.trim()), ids, stickyColumns, before, after, scroll,
        unchecked: !checkbox.checked, nextIds: [...d.querySelectorAll('tbody tr')].map(row => row.cells[0].textContent.trim()),
        fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth }
    })
    assert.deepEqual(result.headers.slice(0, 2), ['ID', 'Student'])
    assert.ok(result.ids.length > 0)
    assert.deepEqual(result.ids, result.ids.map((_, index) => String(index + 1)))
    assert.ok(result.stickyColumns.every(columns => columns.length === 1 && columns[0] === 0))
    if (width <= 390) {
      assert.ok(result.scroll > 0)
      assert.ok(Math.abs(result.before.id - result.after.id) <= 1)
      assert.ok(result.after.name < result.before.name)
    }
    assert.equal(result.unchecked, true)
    assert.deepEqual(result.nextIds, result.ids)
    assert.equal(result.fits, true)
  })
})
