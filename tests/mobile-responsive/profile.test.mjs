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
      sessionStorage.clear();
      f.style.cssText = 'position:fixed;top:0;left:0;border:0;height:800px;width:' + arguments[0] + 'px';
      document.body.append(f);
      f.onload = () => setTimeout(async () => {
        try {
          f.onload = null;
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

test('instructor profile displays saved address/employment, offers a pencil icon beside Address and stacks its cards vertically', async t => {
  for (const width of [320, 390, 768, 1440]) await t.test(`${width}px`, async () => {
    const result = await inProfile(width, w => {
      const d = w.document
      const fields = [...d.querySelectorAll('main dl > div')].map(row => ({ label: row.querySelector('dt > span')?.textContent ?? row.querySelector('dt').textContent, value: row.querySelector('dd').textContent.trim() }))
      const edit = d.querySelector('[aria-label="Edit address"]'), label = edit.parentElement.querySelector('span')
      const editBounds = edit.getBoundingClientRect(), labelBounds = label.getBoundingClientRect()
      const avatarBounds = d.querySelector('main [role="img"]').getBoundingClientRect()
      const photoTextBounds = d.querySelector('label[for="instructor-profile-photo"]').parentElement.getBoundingClientRect()
      const cards = [...d.querySelectorAll('main [data-slot="card"]')].map(card => card.getBoundingClientRect())
      return { fields, fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth,
        vertical: cards.length === 2 && cards[1].top >= cards[0].bottom + 23.9 && cards[0].left === cards[1].left && cards[0].width === cards[1].width,
        editBesideAddress: editBounds.left >= labelBounds.right && Math.abs(editBounds.height - labelBounds.height) < 1,
        iconOnly: Boolean(edit.querySelector('svg')) && edit.textContent.trim() === '' && edit.getAttribute('aria-haspopup') === 'dialog',
        photoTextCentered: w.innerWidth < 640 || Math.abs((avatarBounds.top + avatarBounds.bottom) / 2 - (photoTextBounds.top + photoTextBounds.bottom) / 2) < 1,
        noSignOut: ![...d.querySelectorAll('main button')].some(node => node.textContent.includes('Sign out')) }
    })
    assert.equal(result.error, undefined, result.error)
    assert.deepEqual(result.fields.map(field => field.label), ['Name', 'Email', 'Address', 'Employment status'])
    assert.equal(result.fields[2].value, '18 Sin Ming Lane\nSingapore 573960')
    assert.equal(result.fields[3].value, 'Part time')
    assert.equal(result.editBesideAddress, true)
    assert.equal(result.iconOnly, true)
    assert.equal(result.photoTextCentered, true)
    assert.equal(result.fits, true)
    assert.equal(result.vertical, true)
    assert.equal(result.noSignOut, true)
  })
})

test('address dialog saves, persists after reload, cancels drafts and clears the address', async t => {
  for (const width of [320, 390, 1440]) await t.test(`${width}px`, async () => {
    const result = await inProfile(width, async (w, wait) => {
      let d = w.document
      const edit = () => d.querySelector('[aria-label="Edit address"]').click()
      const type = value => {
        const input = d.querySelector('#instructor-address')
        Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, value)
        input.dispatchEvent(new w.Event('input', { bubbles: true }))
      }
      edit(); await wait(150)
      const focused = d.activeElement.id === 'instructor-address'
      const dialog = d.querySelector('[data-slot="dialog-content"]'), bounds = dialog.getBoundingClientRect()
      const bounded = bounds.left >= 15 && bounds.right <= w.innerWidth - 15 && bounds.top >= 15 && bounds.bottom <= w.innerHeight - 15
      const labelledDialog = dialog.querySelector('[data-slot="dialog-title"]').textContent === 'Edit address'
      const unchangedDisabled = [...d.querySelectorAll('button')].find(b => b.textContent === 'Save address').disabled
      type('New mailing address\nSingapore 654321'); await wait(50)
      d.querySelector('#instructor-address-editor').requestSubmit(); await wait(400)
      const saved = d.querySelector('[role="status"]')?.textContent.includes('Address updated.')
      const focusReturned = d.activeElement.getAttribute('aria-label') === 'Edit address'
      const fits = d.documentElement.scrollWidth <= d.documentElement.clientWidth
      w.location.href = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent('/instructor/profile'); await wait(1000); d = w.document
      const persisted = d.querySelector('main dl').textContent.includes('New mailing address')
      edit(); await wait(50); type('Unsaved draft'); await wait(50)
      ;[...d.querySelectorAll('#instructor-address-editor button')].find(b => b.textContent === 'Cancel').click(); await wait(200)
      const cancelled = !d.querySelector('#instructor-address-editor') && d.querySelector('main dl').textContent.includes('New mailing address')
      edit(); await wait(50); type(''); await wait(50)
      d.querySelector('#instructor-address-editor').requestSubmit(); await wait(400)
      return { focused, focusReturned, bounded, labelledDialog, unchangedDisabled, saved, fits, persisted, cancelled,
        cleared: d.querySelector('main dl').textContent.includes('Not provided') }
    })
    for (const [key, value] of Object.entries(result)) assert.equal(value, true, key)
  })
})

test('address save failures retain drafts and slow saves prevent duplicate submissions', async () => {
  for (const mode of ['address-error', 'address-slow']) {
    const result = await inProfile(390, async (w, wait) => {
      const d = w.document
      d.querySelector('[aria-label="Edit address"]').click(); await wait(50)
      const input = d.querySelector('#instructor-address')
      Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, 'Keep this draft')
      input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50)
      const form = d.querySelector('#instructor-address-editor')
      form.requestSubmit(); form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait(50)
      const disabled = [...form.querySelectorAll('button')].every(button => button.disabled)
      input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
      const pendingDialogKept = Boolean(d.querySelector('[data-slot="dialog-content"]'))
      const calls = w.profileWriteRequestsFixture.filter(value => value === 'address').length
      await wait(250)
      const errorMode = w.location.search.includes('address-error')
      const retained = !errorMode || input.value === 'Keep this draft' && Boolean(d.querySelector('#instructor-address-error'))
      if (errorMode) { form.requestSubmit(); await wait(350) } else await wait(1600)
      return { disabled, pendingDialogKept, calls, retained, saved: !d.querySelector('#instructor-address-editor') }
    }, `/instructor/profile?fixtureData=${mode}`)
    assert.equal(result.calls, 1)
    for (const key of ['disabled', 'pendingDialogKept', 'retained', 'saved']) assert.equal(result[key], true, `${mode}: ${key}`)
  }
})

test('Escape closes the address dialog without saving and returns focus to the pencil icon', async () => {
  const result = await inProfile(390, async (w, wait) => {
    const d = w.document, trigger = d.querySelector('[aria-label="Edit address"]')
    trigger.click(); await wait(150)
    const input = d.querySelector('#instructor-address')
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, 'Unsaved address')
    input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50)
    input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })); await wait(250)
    return { closed: !d.querySelector('[data-slot="dialog-content"]'), focusReturned: d.activeElement === trigger,
      unchanged: d.querySelector('main dl').textContent.includes('18 Sin Ming Lane'), noWrites: w.profileWriteRequestsFixture.length === 0 }
  })
  for (const [key, value] of Object.entries(result)) assert.equal(value, true, key)
})

test('device photos are saved, appear in the account avatar, persist after reload and can be removed', async () => {
  const result = await inProfile(1440, async (w, wait) => {
    let d = w.document
    const canvas = d.createElement('canvas'); canvas.width = 20; canvas.height = 30
    canvas.getContext('2d').fillRect(0, 0, 20, 30)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    const file = new w.File([blob], 'device-photo.png', { type: 'image/png' })
    const transfer = new w.DataTransfer(); transfer.items.add(file)
    const input = d.querySelector('#instructor-profile-photo'); input.files = transfer.files
    input.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(700)
    const saved = [...d.querySelectorAll('[data-slot="alert"][role="status"] [data-slot="alert-description"]')].some(node => node.textContent.includes('Profile picture updated.'))
    const avatarUpdated = Boolean(d.querySelector('[aria-label^="Open account menu for"] img'))
    const removeButton = [...d.querySelectorAll('main button')].find(button => button.textContent.includes('Remove photo'))
    const actionsRightAligned = Math.abs(removeButton.getBoundingClientRect().right - removeButton.parentElement.getBoundingClientRect().right) < 1
    w.location.href = '/tests/mobile-responsive/calendar.html?route=' + encodeURIComponent('/instructor/profile'); await wait(1000); d = w.document
    const persisted = [...d.querySelectorAll('main button')].some(button => button.textContent.includes('Remove photo'))
    ;[...d.querySelectorAll('main button')].find(button => button.textContent.includes('Remove photo')).click(); await wait(400)
    return { saved, avatarUpdated, actionsRightAligned, persisted,
      removed: ![...d.querySelectorAll('main button')].some(button => button.textContent.includes('Remove photo')),
      feedback: [...d.querySelectorAll('[data-slot="alert"][role="status"] [data-slot="alert-description"]')].some(node => node.textContent.includes('Profile picture removed.')) }
  })
  for (const [key, value] of Object.entries(result)) assert.equal(value, true, key)
})

test('empty and failed profile loads do not manufacture saved data; failures offer a retry', async () => {
  const empty = await inProfile(320, w => ({
    honest: w.document.querySelector('main dl').textContent.includes('Not provided') && w.document.querySelector('main dl').textContent.includes('Not specified'),
  }), '/instructor/profile?fixtureData=profile-empty')
  assert.equal(empty.honest, true)
  const failure = await inProfile(390, async (w, wait) => {
    const d = w.document
    const disabled = d.querySelector('[aria-label="Edit address"]').disabled
    const retry = [...d.querySelectorAll('button')].find(button => button.textContent === 'Retry loading profile')
    retry.click(); await wait(350)
    return { disabled, recovered: !d.querySelector('[aria-label="Edit address"]').disabled && d.querySelector('main dl').textContent.includes('18 Sin Ming Lane') }
  }, '/instructor/profile?fixtureData=profile-error')
  assert.equal(failure.disabled, true)
  assert.equal(failure.recovered, true)
})

test('an account switch during address saving cannot populate the next profile', async () => {
  const result = await inProfile(390, async (w, wait) => {
    const d = w.document
    d.querySelector('[aria-label="Edit address"]').click(); await wait(50)
    const input = d.querySelector('#instructor-address')
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, 'Previous private address')
    input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50)
    d.querySelector('#instructor-address-editor').requestSubmit(); await wait(50)
    w.switchInstructorFixture(); await wait(1900)
    return { noOldData: !d.querySelector('main').textContent.includes('Previous private address'),
      emptyAddress: d.querySelector('main dl').textContent.includes('Not provided'),
      noOldFeedback: !d.querySelector('main').textContent.includes('Address updated.') }
  }, '/instructor/profile?fixtureData=address-slow')
  for (const [key, value] of Object.entries(result)) assert.equal(value, true, key)
})

test('a confirmed save still updates the shared profile cache after navigating away', async () => {
  const result = await inProfile(1440, async (w, wait, openAccount) => {
    const d = w.document
    d.querySelector('[aria-label="Edit address"]').click(); await wait(50)
    const input = d.querySelector('#instructor-address')
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set.call(input, 'Saved while navigating')
    input.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(50)
    d.querySelector('#instructor-address-editor').requestSubmit(); await wait(50)
    d.querySelector('a[href^="/instructor/calendar"]').click(); await wait(1800)
    const navigated = w.location.pathname === '/instructor/calendar'
    await openAccount()
    d.querySelector('[data-slot="popover-content"] a[href="/instructor/profile"]').click(); await wait(300)
    return { navigated, saved: d.querySelector('main dl').textContent.includes('Saved while navigating') }
  }, '/instructor/profile?fixtureData=address-slow')
  assert.equal(result.navigated, true)
  assert.equal(result.saved, true)
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
