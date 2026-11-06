import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173'
const driver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'
const classId = '00000000-0000-4000-8000-202611020001'
const gradingId = '00000000-0000-4000-8000-202611070008'
const studentId = '00000000-0000-4000-8000-000000000100'
const reportsPath = `/instructor/reports/${classId}`
const assessmentPath = `/instructor/assessments/${gradingId}/${studentId}`
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
      f.style.cssText = 'position:fixed;top:0;left:0;border:0;width:${width}px;height:700px';
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

test('report cards show actual feedback/authors and preserve the responsive one/two-column layout', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inPage(width, reportsPath, w => {
      const d = w.document, cards = [...d.querySelectorAll('[data-report-student-id]')]
      return { text: d.querySelector('main').textContent, cards: cards.length, columns: w.getComputedStyle(cards[0].parentElement).gridTemplateColumns.split(' ').length,
        href: cards[0].querySelector('a').getAttribute('href'), back: d.querySelector('main a').getAttribute('href'),
        previous: cards[0].querySelectorAll('li').length, fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth }
    })
    assert.equal(result.cards, 6)
    assert.equal(result.columns, width >= 768 ? 2 : 1)
    assert.match(result.text, /Stored current report/)
    assert.match(result.text, /Report by Actual Report Author/)
    assert.match(result.text, /Report author not recorded/)
    assert.match(result.text, /Actual earlier feedback 1/)
    assert.match(result.text, /Other Dojo/)
    assert.match(result.text, /No previous lesson feedback recorded/)
    assert.equal(result.previous, 2)
    assert.match(result.href, /\/instructor\/students\/[0-9a-f-]{36}\?session=.*&tab=sessions&date=2026-11-02/)
    assert.match(result.back, /session=.*&date=2026-11-02/)
    assert.equal(result.fits, true)
  })
})

test('assessment keeps its form layout while reading the exact event/student record and application target', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inPage(width, assessmentPath, w => {
      const d = w.document, form = d.querySelector('form'), notes = form.querySelector('textarea')
      const pressed = [...form.querySelectorAll('[aria-pressed]')].map(e => [e.textContent.trim(), e.getAttribute('aria-pressed'), e.disabled])
      form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }))
      return { text: d.querySelector('main').textContent, pressed, readOnly: notes.readOnly, notes: notes.value,
        target: [...form.querySelectorAll('dl [data-slot="grade-badge"]')].map(e => e.getAttribute('data-grade-id')),
        saveDisabled: form.querySelector('[type="submit"]').disabled, profile: form.querySelector('a').getAttribute('href'),
        fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth }
    })
    assert.match(result.text, /Recorded assessment/)
    assert.match(result.text, /Recorded application grade/)
    assert.equal(result.target[1], 'recorded-application-target')
    assert.notEqual(result.target[0], result.target[1])
    assert.deepEqual(result.pressed, [['pending', 'true', false], ['completed', 'false', false]])
    assert.equal(result.readOnly, false)
    assert.equal(result.saveDisabled, true)
    assert.match(result.notes, /000000000100/)
    assert.match(result.profile, /tab=grading&date=2026-11-07/)
    assert.doesNotMatch(result.text, /Dummy|Local demo|saved locally|Passed/)
    assert.equal(result.fits, true)
  })
})

test('assessment distinguishes absent application, unknown grade join and unrecorded status/notes', async () => {
  for (const [mode, expected] of [['assessment-no-application', /Target grade not recorded/], ['assessment-unknown-grade', /Target grade details unavailable/], ['assessment-unrecorded', /No assessment status recorded/]]) {
    const result = await inPage(390, `${assessmentPath}?fixtureData=${mode}`, w => ({ text: w.document.querySelector('main').textContent,
      pressed: [...w.document.querySelectorAll('main [aria-pressed="true"]')].length, notes: w.document.querySelector('textarea').value }))
    assert.match(result.text, expected)
    if (mode === 'assessment-unrecorded') { assert.equal(result.pressed, 0); assert.equal(result.notes, '') }
  }
})

test('UUID legacy keys and date-only grading dates resolve without synthetic times', async () => {
  assert.match(await inPage(390, `/instructor/assessments/${gradingId}--${studentId}`, w => w.document.querySelector('textarea').value), /Stored assessment notes/)
  const result = await inPage(390, `/instructor/assessments/00000000-0000-4000-8000-000000008800/${studentId}?fixtureData=assessment-date-only`, w => w.document.querySelector('main').textContent)
  assert.match(result, /3 Nov 2026/)
  assert.doesNotMatch(result, /Invalid Date|12:00 AM|NaN/)
})

test('missing event/candidate, wrong event type and malformed keys never manufacture a successful form/report', async () => {
  for (const [path, expected] of [[`${reportsPath}?fixtureData=empty`, /Class report not found/],
    [`/instructor/reports/${gradingId}`, /Class report not found/], [`/instructor/reports/not-a-uuid`, /event ID is invalid/],
    [`/instructor/assessments/${classId}/${studentId}`, /Assessment not found/],
    [`/instructor/assessments/${gradingId}/00000000-0000-4000-8000-000000009999`, /Assessment not found/],
    [`/instructor/assessments/${gradingId}--${studentId}--extra`, /assessment needs an event UUID/]]) {
    assert.match(await inPage(390, path, w => w.document.querySelector('main').textContent), expected)
  }
  const empty = await inPage(390, `${reportsPath}?fixtureData=reports-empty`, w => w.document.querySelector('main').textContent)
  assert.match(empty, /No students are registered for this class/)
})

test('loading modals, permission failures and retry remain distinct from empty successful results', async () => {
  for (const [resource, path] of [['reports', reportsPath], ['assessment', assessmentPath]]) {
    const loading = await inPage(390, `${path}?fixtureData=${resource}-loading`, w => w.document.querySelector('[data-slot="dialog-content"]').textContent, 200)
    assert.match(loading, /Loading/)
    const denied = await inPage(390, `${path}?fixtureData=${resource}-forbidden`, w => w.document.querySelector('main').textContent)
    assert.match(denied, /Instructor access to this session is required/)
    const retry = await inPage(390, `${path}?fixtureData=${resource}-error`, async (w, wait) => {
      const d = w.document, before = d.querySelector('main').textContent
      ;[...d.querySelectorAll('main button')].find(e => e.textContent === 'Try again').click(); await wait()
      return { before, after: d.querySelector('main').textContent }
    })
    assert.match(retry.before, /could not be loaded/)
    assert.match(retry.after, resource === 'reports' ? /Stored current report/ : /Recorded application grade/)
  }
})

test('205 reports load completely; a later-page failure exposes no partial roster and can retry', async () => {
  assert.equal(await inPage(1280, `${reportsPath}?fixtureData=reports-large`, w => w.document.querySelectorAll('[data-report-student-id]').length), 205)
  const result = await inPage(390, `${reportsPath}?fixtureData=reports-page-error`, async (w, wait) => {
    const d = w.document
    await wait(1300)
    const before = { count: d.querySelectorAll('[data-report-student-id]').length, text: d.querySelector('main').textContent }
    ;[...d.querySelectorAll('main button')].find(e => e.textContent === 'Try again').click(); await wait(3600)
    return { before, after: d.querySelectorAll('[data-report-student-id]').length }
  })
  assert.equal(result.before.count, 0)
  assert.match(result.before.text, /reports could not be loaded/)
  assert.equal(result.after, 205)
})

test('account changes discard reports and assessments from the previous account immediately', async () => {
  for (const path of [reportsPath, assessmentPath]) {
    const result = await inPage(390, path, async (w, wait) => {
      const before = w.document.querySelector('main').textContent
      w.switchInstructorFixture(); await wait(100)
      return { before, after: w.document.querySelector('main').textContent }
    })
    assert.match(result.before, /Stored current report|Recorded application grade/)
    assert.doesNotMatch(result.after, /Stored current report|Recorded application grade/)
    assert.match(result.after, /not found/)
  }
})

test('late assessment-candidate responses cannot replace a newly selected candidate', async () => {
  const result = await inPage(390, `${assessmentPath}?fixtureData=assessment-race`, async (w, wait) => {
    w.history.pushState(null, '', '/instructor/assessments/00000000-0000-4000-8000-202611070008/00000000-0000-4000-8000-000000000101?fixtureData=assessment-race')
    w.dispatchEvent(new w.PopStateEvent('popstate')); await wait(1800)
    return { notes: w.document.querySelector('textarea').value, selected: w.document.querySelector('[aria-pressed="true"]').textContent }
  }, 200)
  assert.match(result.notes, /000000000101/)
  assert.doesNotMatch(result.notes, /000000000100/)
  assert.equal(result.selected, 'completed')
})

test('the existing grading-roster action opens the matching assessment and profile context', async () => {
  const result = await inPage(390, `/instructor/calendar?view=month&date=2026-11-7&session=${gradingId}`, async (w, wait) => {
    const d = w.document
    d.querySelector('a[aria-label^="View grading assessment for"]').click(); await wait()
    const assessment = { path: w.location.pathname, notes: d.querySelector('textarea').value }
    d.querySelector('form a').click(); await wait()
    return { assessment, path: w.location.pathname, search: w.location.search }
  })
  assert.equal(result.assessment.path, assessmentPath)
  assert.match(result.assessment.notes, /000000000100/)
  assert.equal(result.path, `/instructor/students/${studentId}`)
  assert.match(result.search, /tab=grading/)
  assert.match(result.search, /session=00000000-0000-4000-8000-202611070008/)
})

test('late previous-class reports cannot replace a newly selected class', async () => {
  const result = await inPage(390, `${reportsPath}?fixtureData=reports-race`, async (w, wait) => {
    w.history.pushState(null, '', '/instructor/reports/00000000-0000-4000-8000-202611050005?fixtureData=reports-race')
    w.dispatchEvent(new w.PopStateEvent('popstate')); await wait(1800)
    return w.document.querySelector('main').textContent
  }, 200)
  assert.match(result, /202611050005/)
  assert.doesNotMatch(result, /202611020001/)
})
