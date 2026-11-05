import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173'
const webdriver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'
const student = '00000000-0000-4000-8000-000000000100'
let session

async function request(path, body, method = 'POST') {
  const response = await fetch(`${webdriver}${path}`, {
    method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  })
  const result = await response.json()
  if (!response.ok) throw new Error(JSON.stringify(result))
  return result.value
}

before(async () => {
  const created = await request('/session', { capabilities: { alwaysMatch: {
    browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] },
  } } })
  session = created.sessionId
  await request(`/session/${session}/url`, { url: `${origin}/tests/mobile-responsive/calendar.html` })
})
after(async () => { if (session) await request(`/session/${session}`, undefined, 'DELETE') })

async function inDetail(width, inspect, { id = student, query = '', height = 700, delay = 700 } = {}) {
  const result = await request(`/session/${session}/execute/async`, { args: [], script: `
    const done = arguments[arguments.length - 1];
    (async () => {
      const f = document.createElement('iframe');
      f.style.cssText = 'width:${width}px;height:${height}px;border:0;position:fixed;top:0;left:0';
      document.body.append(f);
      try {
        await new Promise(resolve => { f.onload = () => setTimeout(resolve, ${delay}); f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(${JSON.stringify(`/instructor/students/${id}${query}`)}); });
        const wait = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));
        done(await (${inspect.toString()})(f.contentWindow, wait, f));
      } catch (error) { done({ error: String(error) }); }
      finally { f.remove(); }
    })();` })
  assert.equal(result?.error, undefined, result?.error)
  return result
}

test('real UUID profiles preserve responsive layout and use stored contact, medical and centre records', async t => {
  for (const width of [320, 390, 768, 1024, 1440]) await t.test(`${width}px`, async () => {
    const result = await inDetail(width, async (w, wait) => {
      const d = w.document
      const button = label => [...d.querySelectorAll('button')].find(e => e.textContent.trim().startsWith(label) && e.getBoundingClientRect().height > 0)
      const main = d.querySelector('main').textContent
      button('Contact').click(); await wait()
      const dialog = d.querySelector('.student-detail-view[role="dialog"]')
      const contacts = dialog.textContent
      const email = dialog.querySelector('a[href^="mailto:"]').getAttribute('href')
      dialog.querySelector('[data-slot="dialog-close"]').click(); await wait()
      button('Medical alerts').click(); await wait()
      return { main, contacts, email, medical: d.querySelector('.student-detail-view[role="dialog"]').textContent,
        fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth }
    })
    assert.equal(result.fits, true)
    assert.match(result.main, /STU-0001/)
    assert.match(result.main, /Central Dojo/)
    assert.match(result.main, /67%/)
    assert.equal(result.email, 'mailto:member-0@example.test')
    assert.match(result.contacts, /Phone not recorded/)
    assert.ok(result.contacts.indexOf('Primary Guardian') < result.contacts.indexOf('Secondary Guardian'))
    assert.match(result.medical, /Stored medical alert/)
    assert.doesNotMatch(result.main, /example\.com|Passed/)
  })
})

test('history spans all pages/instructors/dojos, retains all attendance states and real report authors', async () => {
  const result = await inDetail(1280, async (w, wait) => {
    const d = w.document
    const initial = d.querySelector('main').textContent
    ;[...d.querySelectorAll('[role="tab"]')].find(e => e.textContent === 'Sessions').click(); await wait()
    const history = () => d.querySelector('[aria-label="Session history"]')
    const first = history().textContent
    const badges = [...history().querySelectorAll('[role="img"][aria-label]')].map(e => e.getAttribute('aria-label'))
    const cardCount = history().querySelectorAll('[data-session-id]').length
    const disabled = [...history().querySelectorAll('button')].filter(e => /Add report|Edit report/.test(e.textContent)).every(e => e.disabled)
    const button = label => [...history().querySelectorAll('button')].find(e => e.textContent.trim() === label)
    button('Next').click(); await wait()
    const second = history().querySelector('[data-session-id] h3').textContent
    const attendance = history().querySelector('select')
    attendance.value = 'late'; attendance.dispatchEvent(new w.Event('change', { bubbles: true })); await wait()
    const filtered = history().textContent
    const sort = history().querySelectorAll('select')[1]
    sort.value = 'oldest'; sort.dispatchEvent(new w.Event('change', { bubbles: true })); await wait()
    const oldest = history().querySelector('[data-session-id] h3').textContent
    ;[...d.querySelectorAll('[role="tab"]')].find(e => e.textContent === 'Overview').click(); await wait()
    return { initial, first, badges, cardCount, disabled, second, filtered, oldest, final: d.querySelector('[aria-label="Attendance summary"]').textContent }
  }, { query: '?fixtureData=detail-history-large' })
  assert.match(result.initial, /82\/123 sessions/)
  assert.equal(result.cardCount, 20)
  assert.match(result.first, /205 sessions/)
  assert.match(result.first, /Other Dojo/)
  assert.match(result.first, /Class instructor: Class Teacher/)
  assert.match(result.first, /Visiting Author/)
  assert.match(result.first, /Report author not recorded/)
  assert.deepEqual([...new Set(result.badges)].sort(), ['absent', 'excused', 'late', 'present', 'unmarked'])
  assert.equal(result.disabled, true)
  assert.equal(result.second, 'Stored class 21')
  assert.match(result.filtered, /41 sessions · late/)
  assert.match(result.filtered, /Page 1 of 3/)
  assert.equal(result.oldest, 'Stored class 202')
  assert.match(result.final, /82\/123 sessions/)
})

test('missing optional joins and records have explicit empty states', async () => {
  const result = await inDetail(390, async (w, wait) => {
    const d = w.document
    const main = d.querySelector('main').textContent
    const buttons = () => [...d.querySelectorAll('button')].filter(e => e.getBoundingClientRect().height > 0)
    buttons().find(e => e.textContent.trim() === 'Contact').click(); await wait()
    const contacts = d.querySelector('.student-detail-view[role="dialog"]').textContent
    d.querySelector('.student-detail-view[role="dialog"] [data-slot="dialog-close"]').click(); await wait()
    buttons().find(e => e.textContent.trim() === 'Medical alerts').click(); await wait()
    return { main, contacts, medical: d.querySelector('.student-detail-view[role="dialog"]').textContent }
  }, { query: '?fixtureData=detail-optional' })
  assert.match(result.main, /Grade not recorded/)
  assert.match(result.main, /Dojo not recorded/)
  assert.match(result.contacts, /No emergency contacts recorded/)
  assert.match(result.medical, /No active medical alerts recorded/)
})

test('empty history and summary never manufacture training or reports', async () => {
  const result = await inDetail(390, async (w, wait) => {
    const d = w.document
    const overview = d.querySelector('main').textContent
    d.querySelector('[aria-label="Attendance reporting period"]').click(); await wait()
    const period = d.querySelector('[data-slot="popover-content"]').textContent
    d.querySelector('[aria-label="Attendance reporting period"]').click(); await wait()
    ;[...d.querySelectorAll('[role="tab"]')].find(e => e.textContent === 'Sessions').click(); await wait()
    return { overview, period, history: d.querySelector('[aria-label="Session history"]').textContent }
  }, { query: '?fixtureData=detail-empty' })
  assert.match(result.period, /No completed sessions recorded/)
  assert.match(result.overview, /No feedback recorded yet/)
  assert.match(result.history, /0 sessions/)
  assert.match(result.history, /No training sessions recorded/)
})

test('profile loading, failure/retry, missing records and invalid IDs remain distinct', async () => {
  const loading = await inDetail(390, w => w.document.querySelector('[data-slot="dialog-content"]').textContent, { query: '?fixtureData=detail-loading', delay: 200 })
  assert.match(loading, /Loading/)
  assert.doesNotMatch(loading, /STU-0001/)
  const failure = await inDetail(390, async (w, wait) => {
    const d = w.document
    const before = d.querySelector('main').textContent
    ;[...d.querySelectorAll('main button')].find(e => e.textContent === 'Try again').click(); await wait()
    return { before, after: d.querySelector('main').textContent }
  }, { query: '?fixtureData=detail-error' })
  assert.match(failure.before, /detail could not be loaded/)
  assert.match(failure.after, /STU-0001/)
  assert.match(await inDetail(390, w => w.document.querySelector('main').textContent, { query: '?fixtureData=detail-missing' }), /Student not found/)
  assert.match(await inDetail(390, w => w.document.querySelector('main').textContent, { id: 'student-1' }), /student ID is invalid/)
})

test('summary and history failures expose retries without becoming successful empty reads', async () => {
  const summary = await inDetail(1280, async (w, wait) => {
    const root = w.document.querySelector('[aria-label="Attendance summary"]')
    const before = root.textContent
    root.querySelector('button').click(); await wait()
    return { before, after: root.textContent }
  }, { query: '?fixtureData=summary-error' })
  assert.match(summary.before, /summary could not be loaded/)
  assert.doesNotMatch(summary.before, /0 completed classes/)
  assert.match(summary.after, /10\/15 sessions/)
  const history = await inDetail(1280, async (w, wait) => {
    const d = w.document
    ;[...d.querySelectorAll('[role="tab"]')].find(e => e.textContent === 'Sessions').click(); await wait()
    const root = d.querySelector('[aria-label="Session history"]')
    const before = root.textContent
    ;[...root.querySelectorAll('button')].find(e => e.textContent === 'Try again').click(); await wait()
    return { before, after: root.textContent }
  }, { query: '?fixtureData=history-error&tab=sessions' })
  assert.match(history.before, /history could not be loaded/)
  assert.match(history.after, /25 sessions/)
})

test('unlinked instructors can deep-link an expired student without enrolment', async () => {
  const result = await inDetail(390, w => w.document.querySelector('main').textContent, {
    id: '00000000-0000-4000-8000-000000008000', query: '?fixtureData=unlinked',
  })
  assert.match(result, /Unassigned Student/)
  assert.match(result, /expired/)
})

test('UUID class context loads a full roster and preserves the calendar return date/session', async () => {
  const result = await inDetail(1280, async (w, wait) => {
    const d = w.document
    const back = [...d.querySelectorAll('main a')].find(e => e.textContent.includes('Back to calendar'))
    const group = d.querySelector('[aria-label="Students in this class"]')
    const before = group.textContent
    group.querySelector('a').click(); await wait()
    return { back: back.getAttribute('href'), before, path: w.location.pathname, search: w.location.search, main: d.querySelector('main').textContent }
  }, { query: '?session=00000000-0000-4000-8000-202611020001&tab=sessions' })
  assert.match(result.back, /\/instructor\/calendar\?session=.*&date=2026-11-02/)
  assert.match(result.before, /Student 1 of/)
  assert.notEqual(result.path, `/instructor/students/${student}`)
  assert.match(result.search, /session=00000000-0000-4000-8000-202611020001/)
  assert.match(result.search, /tab=sessions/)
})

test('changing student/account hides previous profile and feedback immediately and ignores late responses', async () => {
  const race = await inDetail(390, async (w, wait) => {
    const d = w.document
    const initial = d.querySelector('[data-slot="dialog-content"]').textContent
    w.history.pushState(null, '', '/instructor/students/00000000-0000-4000-8000-000000000101?fixtureData=detail-race')
    w.dispatchEvent(new w.PopStateEvent('popstate')); await wait(100)
    const changed = d.querySelector('main').textContent
    await wait(2200)
    return { initial, changed, final: d.querySelector('main').textContent }
  }, { query: '?fixtureData=detail-race', delay: 200 })
  assert.match(race.initial, /Loading/)
  assert.match(race.changed, /STU-0002/)
  assert.doesNotMatch(race.final, /STU-0001/)
  const account = await inDetail(390, async (w, wait) => {
    const d = w.document
    const before = d.querySelector('main').textContent
    w.switchInstructorFixture(); await wait(100)
    const pending = d.querySelector('main').textContent
    await wait(1900)
    return { before, pending, after: d.querySelector('main').textContent }
  })
  assert.match(account.before, /Stored feedback/)
  assert.doesNotMatch(account.pending, /STU-0001|Stored feedback/)
  assert.match(account.after, /NEW-ACCOUNT/)
  assert.match(account.after, /Replacement account feedback/)
  assert.doesNotMatch(account.after, /Stored feedback/)
})

test('grading uses the existing structured readiness layout and a separate read-only technique review', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inDetail(width, async (w, wait) => {
      const d = w.document
      const next = [...d.querySelectorAll('.detail-section')].find(e => e.querySelector('h2')?.textContent === 'Next grading')
      const overview = next.textContent
      ;[...d.querySelectorAll('[role="tab"]')].find(e => e.textContent === 'Grading').click(); await wait()
      const content = d.querySelector('[role="tabpanel"][data-state="active"]') ?? [...d.querySelectorAll('[role="tabpanel"]')].find(e => e.getBoundingClientRect().height > 0)
      const eligibility = content.querySelector('[aria-label="Grading eligibility"]')
      const rows = [...eligibility.querySelectorAll('[data-requirement]')]
      const progress = eligibility.querySelector('progress')
      const before = { overview, text: content.textContent,
        headingCount: content.querySelectorAll('h2').length,
        cardClasses: [...content.querySelectorAll('[data-slot="card"]')].map(e => e.className),
        rowCount: rows.length, rowsFit: rows.every(e => e.scrollWidth <= e.clientWidth),
        progress: [progress.value, progress.max],
        assessments: content.querySelectorAll('[data-assessment-id]').length,
        historyArrows: content.querySelector('[aria-label="Grading history"]').textContent.includes('→'),
        fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth,
      }
      ;[...content.querySelectorAll('button')].find(e => e.textContent === 'Review grading').click(); await wait()
      const dialog = d.querySelector('.grading-review-dialog')
      const review = dialog.textContent
      const boxes = [...dialog.querySelectorAll('[role="checkbox"]')]
      const bounds = dialog.getBoundingClientRect()
      ;[...dialog.querySelectorAll('button')].find(e => e.textContent === 'Finish review').click(); await wait()
      return { ...before, review, checkboxCount: boxes.length, readOnly: boxes.every(e => e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'),
        bounded: bounds.left >= 0 && bounds.right <= d.documentElement.clientWidth + 1 && bounds.top >= 0 && bounds.bottom <= w.innerHeight + 1,
        closed: !d.querySelector('.grading-review-dialog') }
    }, { query: '?fixtureData=grading-ready' })
    assert.match(result.overview, /Stored next grade.*Ready to start assessment/)
    assert.match(result.text, /Ready to start assessment/)
    assert.match(result.review, /0 of 1 techniques completed/)
    assert.match(result.review, /Stored assessment technique.*Not signed off/)
    assert.match(result.text, /Assessment: Pending/)
    assert.match(result.text, /Assessment: Completed/)
    assert.match(result.text, /Target grade: Not recorded/)
    assert.match(result.text, /Stored assessment notes 1/)
    assert.doesNotMatch(result.text, /Passed|promoted/)
    assert.equal(result.historyArrows, false)
    assert.equal(result.headingCount, 2)
    assert.equal(result.rowCount, 5)
    assert.equal(result.rowsFit, true)
    assert.deepEqual(result.progress, [5, 5])
    assert.equal(result.assessments, 2)
    assert.ok(result.cardClasses.every(value => value.includes('detail-card')))
    assert.equal(result.checkboxCount, 1)
    assert.equal(result.readOnly, true)
    assert.equal(result.bounded, true)
    assert.equal(result.closed, true)
    assert.equal(result.fits, true)
  })
})

test('grading history follows all pages and sign-offs retain stored IDs, notes and unknown signers', async () => {
  const result = await inDetail(1280, async (w, wait) => {
    const root = [...w.document.querySelectorAll('[role="tabpanel"]')].find(e => e.getBoundingClientRect().height > 0)
    const history = root.textContent
    ;[...root.querySelectorAll('button')].find(e => e.textContent === 'Review grading').click(); await wait()
    return history + w.document.querySelector('.grading-review-dialog').textContent
  }, { query: '?fixtureData=grading-history-large&tab=grading' })
  assert.match(result, /Stored grading 205/)
  assert.match(result, /Stored assessment notes 205/)
  assert.match(result, /Stored syllabus note/)
  assert.match(result, /Instructor not recorded.*Stored sign-off note/)
})

test('grading missing rules, terminal grades and empty recorded assessment history remain explicit', async () => {
  for (const [mode, expected] of [['grading-missing-rules', /Requirements not recorded/], ['grading-terminal', /No further grade/], ['grading-empty', /No recorded grading assessments/]]) {
    const result = await inDetail(390, w => w.document.querySelector('main').textContent, { query: `?fixtureData=${mode}&tab=grading` })
    assert.match(result, expected)
    if (mode !== 'grading-empty') assert.doesNotMatch(result, /Ready to start assessment/)
  }
})

test('grading loading uses the existing modal; failed reference/sign-off/history reads retry without a mock fallback', async () => {
  const loading = await inDetail(390, w => ({ modal: w.document.querySelector('[data-slot="dialog-content"]').textContent,
    main: w.document.querySelector('main').textContent }), { query: '?fixtureData=grading-loading&tab=grading', delay: 200 })
  assert.match(loading.modal, /Loading student details/)
  assert.doesNotMatch(loading.main, /Stored next grade|Ready to start assessment/)
  for (const resource of ['reference', 'signoffs', 'history']) {
    const result = await inDetail(390, async (w, wait) => {
      const d = w.document
      const before = d.querySelector('main').textContent
      ;[...d.querySelectorAll('main button')].find(e => e.textContent === 'Try again').click(); await wait()
      return { before, after: d.querySelector('main').textContent }
    }, { query: `?fixtureData=grading-${resource}-error&tab=grading` })
    assert.match(result.before, /Grading .* could not be loaded/)
    assert.doesNotMatch(result.before, /Stored grading 1|Ready to start assessment/)
    assert.match(result.after, /Stored grading 1/)
  }
})

test('grading reads remain isolated across accounts and student changes with late responses', async () => {
  const result = await inDetail(390, async (w, wait) => {
    const d = w.document
    const before = d.querySelector('main').textContent
    w.switchInstructorFixture(); await wait(100)
    const pending = d.querySelector('main').textContent
    await wait(1900)
    return { before, pending, after: d.querySelector('main').textContent }
  }, { query: '?tab=grading' })
  assert.match(result.before, /Stored assessment notes/)
  assert.doesNotMatch(result.pending, /Stored assessment notes|STU-0001/)
  assert.match(result.after, /Replacement account assessment notes/)
  assert.doesNotMatch(result.after, /Stored assessment notes/)
  const race = await inDetail(390, async (w, wait) => {
    w.history.pushState(null, '', '/instructor/students/00000000-0000-4000-8000-000000000101?fixtureData=grading-race&tab=grading')
    w.dispatchEvent(new w.PopStateEvent('popstate')); await wait(100)
    await wait(1800)
    return w.document.querySelector('main').textContent
  }, { query: '?fixtureData=grading-race&tab=grading', delay: 200 })
  assert.match(race, /STU-0002/)
  assert.doesNotMatch(race, /STU-0001/)
  assert.match(race, /New student assessment notes/)
  assert.doesNotMatch(race, /Original student assessment notes/)
})
