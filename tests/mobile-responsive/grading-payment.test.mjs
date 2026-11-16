// Real Chrome, production components and routes; only auth/RPC are fixture data.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5180'
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
let chrome, profileDir, socket, port
let nextId = 0
const pending = new Map()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function send(method, params = {}) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}

async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return
    await wait(100)
  }
  throw new Error(`Timed out: ${expression}`)
}

before(async () => {
  profileDir = await mkdtemp(join(process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : tmpdir(), 'grading-browser-'))
  chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  const endpoint = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 20000)
    chrome.once('error', reject)
    chrome.stderr.on('data', (chunk) => {
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(String(chunk))
      if (match) { clearTimeout(timeout); resolve(Number(match[1])) }
    })
  })
  port = endpoint
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.method === 'Fetch.requestPaused') {
      void send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'content-type', value: 'text/html; charset=utf-8' }],
        body: Buffer.from('<h1>Stripe Checkout fixture — no charge</h1>').toString('base64') })
      return
    }
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(JSON.stringify(message.error)))
    else request.resolve(message.result)
  }
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://checkout.stripe.com/*' }] })
})

after(async () => {
  socket?.close()
  if (chrome && chrome.exitCode === null) {
    const closed = new Promise((resolve) => chrome.once('exit', resolve))
    chrome.kill()
    await closed
  }
  if (profileDir) await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
})

async function open(width, query = '') {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${origin}/tests/mobile-responsive/grading-payment.html${query}` })
  await until(`document.querySelector('h1') !== null`)
}

async function setValue(id, value) {
  await evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)})
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })()`)
  await wait(75)
}

test('5th Kyu stays $77 through application, review and Stripe redirect at 320–1440px', async () => {
  for (const width of [320, 390, 768, 1440]) {
    await open(width, '?appRoute=%2Fgrading')
    await until(`document.querySelector('#target-grade [data-grade-id="blue-gold-5th-kyu"]') !== null`)
    assert.match(await evaluate(`document.querySelector('#your-eligibility').textContent`), /Adult Track/)
    assert.equal(await evaluate(`document.querySelector('select#target-grade')`), null)
    assert.match(await evaluate(`document.querySelector('#base-fee').textContent`), /55\.00/)
    assert.equal(await evaluate(`document.querySelector('#current-grade [data-grade-id="blue-6th-kyu"]') !== null`), true)
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `${width}px application`)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Proceed to Payment').disabled`), true)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Apply for Grading').click()`)
    await until(`document.querySelector('#grading-full-name') !== null`)
    assert.equal(await evaluate(`document.querySelector('#grading-full-name').readOnly && document.querySelector('#grading-emergency_phone').readOnly`), true)
    assert.match(await evaluate(`document.body.textContent`), /Retrieved from your Membership Profile/)
    assert.equal(await evaluate(`document.querySelector('#official-grading-date').value`), '')
    await setValue('official-grading-date', '2026-12-13')
    if (width === 320 || width === 1440) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(process.env.LOCALAPPDATA, 'Temp', 'opencode', `grading-application-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    }
    assert.match(await evaluate(`document.body.textContent`), /77\.00/)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Proceed to Payment').click()`)
    await until(`window.gradingCheckoutCalls?.some(c => c.action === 'checkout')`)
    const body = await evaluate(`window.gradingCheckoutCalls.find(c => c.action === 'checkout')`)
    assert.equal(body.action, 'checkout')
    assert.equal(body.expected_amount, 7700)
    assert.equal(body.grading_date, '2026-12-13')
    await until(`location.origin === 'https://checkout.stripe.com'`)
    assert.equal(await evaluate(`document.querySelector('h1').textContent`), 'Stripe Checkout fixture — no charge')

    // Previously opened review links use the same authoritative quote too.
    await open(width, '?application=1')
    await until(`document.querySelector('[data-testid="grading-total"]') !== null`)
    assert.match(await evaluate(`document.querySelector('[data-testid="grading-total"]').textContent`), /77\.00/)
    assert.equal(await evaluate(`document.querySelectorAll('input').length`), 0)
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `${width}px`)
    if (width === 320 || width === 1440) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(process.env.LOCALAPPDATA, 'Temp', 'opencode', `grading-stripe-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    }
  }
})

test('rank and next-grade fee stay visible without an eligible session', async () => {
  await open(390, '?appRoute=%2Fgrading&empty=1')
  await until(`document.querySelector('#target-grade [data-grade-id="blue-gold-5th-kyu"]') !== null`)
  assert.match(await evaluate(`document.querySelector('#base-fee').textContent`), /55\.00/)
  assert.equal(await evaluate(`document.querySelector('#grading-event')`), null)
})

test('children follow the database children ladder, not the adult ladder', async () => {
  await open(390, '?appRoute=%2Fgrading&child=1')
  await until(`document.querySelector('#target-grade [data-grade-id="blue-silver-6th-kyu"]') !== null`)
  assert.match(await evaluate(`document.querySelector('#your-eligibility').textContent`), /Children Track/)
  assert.equal(await evaluate(`document.querySelector('#grading-event')`), null)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Apply for Grading').click()`)
  await until(`document.querySelector('#official-grading-date') !== null`)
  assert.equal(await evaluate(`document.querySelector('#official-grading-date option[value="2026-12-06"]') !== null`), true)
  await setValue('official-grading-date', '2026-12-06')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Proceed to Payment').disabled`), true)
})

test('unlinked accounts cannot invent a current rank or pay', async () => {
  // No student record means no membership: the page explains that instead of showing a rank or a pay button.
  await open(390, '?appRoute=%2Fgrading&missingStudent=1')
  await until(`document.body.textContent.includes('You need a membership first')`)
  assert.equal(await evaluate(`document.querySelector('#target-grade')`), null)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Proceed to payment'))`), false)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('a')).some(a => a.getAttribute('href') === '/apply-membership')`), true)
})

test('expired and pending members are told why they cannot apply', async () => {
  await open(390, '?appRoute=%2Fgrading&membership=expired')
  await until(`document.body.textContent.includes('Your membership has expired')`)
  assert.equal(await evaluate(`document.querySelector('#target-grade')`), null)
  await open(390, '?appRoute=%2Fgrading&membership=pending')
  await until(`document.body.textContent.includes('isn’t active yet')`)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('a')).some(a => a.getAttribute('href') === '/apply-membership')`), false)
})

test('a checkout option for a skipped grade is not offered', async () => {
  await open(390, '?appRoute=%2Fgrading&grade=brown-4th-kyu')
  await until(`document.querySelector('#target-grade [data-grade-id="blue-gold-5th-kyu"]') !== null`)
  assert.equal(await evaluate(`document.querySelector('#grading-event')`), null)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Apply for Grading').click()`)
  await until(`document.querySelector('#official-grading-date') !== null`)
  await setValue('official-grading-date', '2026-12-13')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Proceed to Payment').disabled`), true)
})

test('on-time 5th Kyu payment is $55; repricing requires an explicit review', async () => {
  await open(390, '?application=1&onTime=1')
  await until(`document.querySelector('[data-testid="grading-total"]') !== null`)
  assert.match(await evaluate(`document.querySelector('[data-testid="grading-total"]').textContent`), /55\.00/)
  await open(390, '?application=1&repriced=1')
  await until(`document.querySelector('[data-testid="grading-total"]') !== null`)
  assert.match(await evaluate(`document.body.textContent`), /fee has been updated/)
  assert.match(await evaluate(`document.querySelector('[data-testid="grading-total"]').textContent`), /77\.00/)
})

test('checkout failures do not produce a fake paid receipt and retain retry', async () => {
  await open(390, '?application=1&rpc=fail')
  await until(`document.querySelector('[role="alert"]') !== null`)
  assert.match(await evaluate(`document.querySelector('[role="alert"]').textContent`), /Unable to contact checkout/)
  assert.equal(await evaluate(`document.body.textContent.includes('Payment Successful')`), false)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('with Stripe')).disabled`), true)
})

test('Stripe success waits for the verified application record, not just the URL', async () => {
  await open(390, '?appRoute=' + encodeURIComponent('/grading/applications?checkout=success&session_id=cs_test_fixture'))
  await until(`document.body.textContent.includes('Confirming your Stripe payment')`)
  await until(`document.body.textContent.includes('Payment confirmed.')`)
  await until(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Payment confirmed' && b.disabled)`)
  assert.equal(await evaluate(`window.gradingCheckoutCalls.filter(c => c.action === 'checkout').length`), 0)
})

test('direct payment without an application cannot start Stripe checkout', async () => {
  await open(320)
  assert.match(await evaluate(`document.body.textContent`), /Select an eligible grading session/)
  assert.equal(await evaluate(`window.gradingCheckoutCalls.length`), 0)
})

test('without official sessions the page never bypasses eligibility through preview checkout', async () => {
  for (const width of [320, 1440]) {
    await open(width, '?appRoute=%2Fgrading&empty=1')
    await until(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Apply for Grading')`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Apply for Grading').click()`)
    await until(`document.querySelector('#official-grading-date') !== null`)
    assert.match(await evaluate(`document.body.textContent`), /No upcoming official grading dates/)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Proceed to Payment').disabled`), true)
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    assert.equal(await evaluate(`window.gradingCheckoutCalls.length`), 0)
  }
})

test('test success is verified without claiming a formal application was submitted', async () => {
  await open(390, '?empty=1&appRoute=' + encodeURIComponent('/grading?checkout=test-success&session_id=cs_test_preview'))
  await until(`document.body.textContent.includes('test payment preview, not an official grading application')`)
  assert.equal(await evaluate(`document.body.textContent.includes('Application submitted')`), false)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Proceed to Payment').disabled`), true)
})

test('previously recorded payments reload as paid and prevent repeat payment', async () => {
  await open(390, '?paidApplication=1&appRoute=%2Fgrading')
  await until(`document.body.textContent.includes('Payment confirmed')`)
  assert.match(await evaluate(`document.body.textContent`), /Awaiting dojo review/)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Payment confirmed')).disabled`), true)
})

test('membership details are prefilled and permanently read-only on the grading page', async () => {
  await open(390, '?appRoute=%2Fgrading')
  await until(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Apply for Grading')`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Apply for Grading').click()`)
  await until(`document.querySelector('#grading-full-name') !== null`)
  await setValue('official-grading-date', '2026-12-13')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('#grading-application-form input, #grading-application-form textarea')).every(el => el.readOnly)`), true)
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('#grading-application-form button')).some(b => /Edit|Save|Cancel/.test(b.textContent))`), false)
  assert.equal(await evaluate(`document.querySelector('#grading-full-name').value`), 'Alex Tan')
  assert.equal(await evaluate(`document.querySelector('#grading-phone').value`), '91234567')
  assert.equal(await evaluate(`document.querySelector('#grading-emergency_name').value`), 'Jamie Tan')
  assert.equal(await evaluate(`document.querySelector('#grading-emergency_phone').value`), '93333333')
  assert.equal(await evaluate(`document.querySelector('#grading-medical').value`), 'Previous knee injury')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Proceed to Payment').disabled`), false)
})

test('missing saved contacts are explained rather than presented as editable empty fields', async () => {
  await open(390, '?appRoute=%2Fgrading&missingProfileDetails=1')
  await until(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Apply for Grading')`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Apply for Grading').click()`)
  await until(`document.querySelector('#grading-full-name') !== null`)
  await setValue('official-grading-date', '2026-12-13')
  assert.match(await evaluate(`document.body.textContent`), /saved membership record is missing contact details/)
  assert.equal(await evaluate(`document.querySelector('#grading-emergency_phone').readOnly`), true)
  assert.equal(await evaluate(`document.querySelector('#grading-emergency_phone').placeholder`), 'Not recorded in your membership')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Proceed to Payment').disabled`), true)
})

test('selecting a date cannot unlock payment for an ineligible student', async () => {
  await open(390, '?appRoute=%2Fgrading&ineligible=1')
  await until(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === 'Apply for Grading')`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Apply for Grading').click()`)
  await until(`document.querySelector('#grading-full-name') !== null`)
  await setValue('official-grading-date', '2026-12-13')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Proceed to Payment').disabled`), true)
  assert.equal(await evaluate(`window.gradingCheckoutCalls.length`), 0)
})

test('Membership belt options switch by DOB, clear invalid selections and preserve shared ranks at mobile/desktop widths', async () => {
  const year = new Date().getFullYear()
  for (const width of [320, 1440]) {
    await open(width, '?membershipForm=1&appRoute=%2Fapply-membership')
    await until(`document.querySelector('#apply-fullName') !== null`)
    for (const [id,value] of Object.entries({ fullName: 'Alex Tan', nric: 'S1234567A', nationality: 'singaporean', dob: `${year-12}-12-31`, gender: 'female', mobile: '91234567', address: 'Test address' })) await setValue(`apply-${id}`, value)
    await evaluate(`(async () => {
      const file = new File([await (await fetch('/logo.png')).blob()], 'photo.png', { type: 'image/png' })
      const transfer = new DataTransfer(); transfer.items.add(file)
      const input = document.querySelector('#apply-photo'); input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Next').click()`)
    await until(`document.querySelector('#apply-currentBelt') !== null && !document.querySelector('#apply-currentBelt').disabled`)
    const childLabels = await evaluate(`Array.from(document.querySelector('#apply-currentBelt').options).slice(1).map(o => o.textContent)`)
    assert.equal(childLabels.length, 15)
    assert.equal(childLabels[0], '12th Kyu (Red)')
    assert.equal(childLabels.at(-1), '1st Kyu (Black Gold)')
    assert.match(await evaluate(`document.body.textContent`), /Children Track/)
    await setValue('apply-currentBelt', 'green-8th-kyu')
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(process.env.LOCALAPPDATA, 'Temp', 'opencode', `membership-children-track-${width}.png`), Buffer.from(screenshot.data, 'base64'))

    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Back').click()`)
    await until(`document.querySelector('#apply-dob') !== null`)
    await setValue('apply-dob', `${year-13}-12-31`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Next').click()`)
    await until(`document.querySelector('#apply-currentBelt') !== null`)
    assert.equal(await evaluate(`document.querySelector('#apply-currentBelt').value`), '')
    assert.deepEqual(await evaluate(`Array.from(document.querySelector('#apply-currentBelt').options).slice(1).map(o => o.textContent)`),
      ['Unranked (Beginner)','6th Kyu (Blue)','5th Kyu (Blue Gold)','4th Kyu (Brown)','3rd Kyu (Brown Gold)','2nd Kyu (Black)','1st Kyu (Black Gold)'])
    assert.match(await evaluate(`document.body.textContent`), /Adult Track/)
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    const adultScreenshot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(process.env.LOCALAPPDATA, 'Temp', 'opencode', `membership-adult-track-${width}.png`), Buffer.from(adultScreenshot.data, 'base64'))
    await setValue('apply-currentBelt', 'blue-6th-kyu')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Back').click()`)
    await until(`document.querySelector('#apply-dob') !== null`)
    await setValue('apply-dob', `${year-12}-01-01`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Next').click()`)
    await until(`document.querySelector('#apply-currentBelt') !== null`)
    assert.equal(await evaluate(`document.querySelector('#apply-currentBelt').value`), 'blue-6th-kyu')
  }
})
