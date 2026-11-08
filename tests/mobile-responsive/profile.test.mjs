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

async function inProfile(width, inspect, route = '/instructor/profile') {
  const result = await request(`/session/${session}/execute/async`, { args: [width], script: `
      const done = arguments[arguments.length - 1], f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;top:0;left:0;border:0;height:800px;width:' + arguments[0] + 'px';
      document.body.append(f);
      f.onload = () => setTimeout(async () => {
        try {
          const wait = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));
          const openAccount = async () => {
            const w = f.contentWindow, d = w.document;
            if (w.innerWidth < 1024 && !d.querySelector('[data-slot="sheet-content"]')) {
              d.querySelector('[aria-label="Open navigation menu"]').click(); await wait();
            }
            const trigger = [...d.querySelectorAll('[aria-label^="Open account menu for"]')].find(node => node.getBoundingClientRect().width > 0);
            trigger.focus(); trigger.click(); await wait();
            return trigger;
          };
          done(await (${inspect.toString()})(f.contentWindow, wait, openAccount));
        } catch (error) { done({ error: String(error) }); }
        finally { f.remove(); }
      }, 700);
      f.src = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent(${JSON.stringify(route)});
    ` })
  assert.equal(result.error, undefined, result.error)
  return result
}

test('instructor profile displays a placeholder address below email and stacks its cards vertically', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inProfile(width, w => {
      const d = w.document
      const fields = [...d.querySelectorAll('main dl > div')].map(row => ({ label: row.querySelector('dt').textContent, value: row.querySelector('dd').textContent }))
      const cards = [...d.querySelectorAll('main [data-slot="card"]')].map(card => card.getBoundingClientRect())
      return { fields, fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth,
        vertical: cards.length === 2 && cards[1].top >= cards[0].bottom + 23.9 && cards[0].left === cards[1].left && cards[0].width === cards[1].width,
        noSignOut: ![...d.querySelectorAll('main button')].some(node => node.textContent.includes('Sign out')) }
    })
    assert.equal(result.error, undefined, result.error)
    assert.deepEqual(result.fields.map(field => field.label), ['Name', 'Email', 'Address', 'Employment status'])
    assert.equal(result.fields[2].value, '123 Example Street, Singapore 123456')
    assert.equal(result.fields[3].value, 'Full time')
    assert.equal(result.fits, true)
    assert.equal(result.vertical, true)
    assert.equal(result.noSignOut, true)
  })
})

test('avatar popover offers Profile and Sign out on desktop and mobile', async t => {
  for (const width of [320, 390, 1440]) await t.test(`${width}px`, async () => {
    const result = await inProfile(width, async (w, wait, openAccount) => {
      const d = w.document, trigger = await openAccount()
      const popup = d.querySelector('[data-slot="popover-content"]'), bounds = popup.getBoundingClientRect()
      const options = [...popup.querySelectorAll('a, button')].map(node => node.textContent.trim())
      const bounded = bounds.left >= 0 && bounds.right <= d.documentElement.clientWidth && bounds.top >= 0 && bounds.bottom <= w.innerHeight
      d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); await wait()
      const escaped = !d.querySelector('[data-slot="popover-content"]') && d.activeElement === trigger
      await openAccount()
      d.querySelector('[data-slot="popover-content"] a').click(); await wait()
      const path = w.location.pathname, closedAfterProfile = !d.querySelector('[data-slot="popover-content"]')
      await openAccount()
      const signOut = d.querySelector('[data-slot="popover-content"] button')
      signOut.click(); signOut.click(); await wait(50)
      const pending = signOut.disabled && signOut.textContent.includes('Signing out')
      await wait(500)
      return { options, bounded, escaped, path, closedAfterProfile, pending, calls: w.instructorSignOutCalls, closedAfterSignOut: !d.querySelector('[data-slot="popover-content"]') }
    }, '/instructor/calendar')
    assert.deepEqual(result.options, ['Profile', 'Sign out'])
    assert.equal(result.path, '/instructor/profile')
    assert.equal(result.calls, 1)
    for (const key of ['bounded', 'escaped', 'closedAfterProfile', 'pending', 'closedAfterSignOut']) assert.equal(result[key], true, key)
  })
})

test('avatar sign-out failures stay visible and allow retry', async () => {
  const result = await inProfile(1440, async (w, wait, openAccount) => {
    const d = w.document
    await openAccount()
    const button = d.querySelector('[data-slot="popover-content"] button')
    button.click(); await wait(500)
    const message = d.querySelector('[role="alert"]').textContent, enabled = !button.disabled
    button.click(); await wait(500)
    return { message, enabled, calls: w.instructorSignOutCalls, closed: !d.querySelector('[data-slot="popover-content"]') }
  }, '/instructor/profile?fixtureData=sign-out-error')
  assert.equal(result.message, 'Unable to sign out. Try again.')
  assert.equal(result.enabled, true)
  assert.equal(result.calls, 2)
  assert.equal(result.closed, true)
})
