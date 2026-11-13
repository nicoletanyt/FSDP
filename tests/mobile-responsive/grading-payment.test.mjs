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
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })()`)
  await wait(75)
}

test('5th Kyu stays $77 through application, review and Stripe redirect at 320–1440px', async () => {
  for (const width of [320, 390, 768, 1440]) {
    await open(width, '?appRoute=%2Fgrading')
    await until(`document.querySelector('#target-grade')?.textContent.includes('Blue-Gold (5th Kyu)')`)
    assert.equal(await evaluate(`document.querySelector('select#target-grade')`), null)
    assert.match(await evaluate(`document.querySelector('#target-grade').textContent`), /55\.00/)
    assert.match(await evaluate(`document.body.textContent`), /Current Rank: Blue \(6th Kyu\)/)
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `${width}px application`)
    if (width === 320 || width === 1440) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(process.env.LOCALAPPDATA, 'Temp', 'opencode', `grading-application-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    }
    assert.match(await evaluate(`document.body.textContent`), /77\.00/)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Proceed to Payment')).click()`)
    await until(`window.gradingCheckoutCalls?.some(c => c.action === 'checkout')`)
    const body = await evaluate(`window.gradingCheckoutCalls.find(c => c.action === 'checkout')`)
    assert.equal(body.action, 'checkout')
    assert.equal(body.expected_amount, 7700)
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
  await until(`document.querySelector('#target-grade')?.textContent.includes('Blue-Gold (5th Kyu)')`)
  assert.match(await evaluate(`document.querySelector('#target-grade').textContent`), /55\.00/)
  assert.equal(await evaluate(`document.querySelector('#grading-event')`), null)
})

test('children follow the database children ladder, not the adult ladder', async () => {
  await open(390, '?appRoute=%2Fgrading&child=1')
  await until(`document.querySelector('#target-grade')?.textContent.includes('Blue-Silver (6th Kyu)')`)
  assert.equal(await evaluate(`document.querySelector('#grading-event')`), null)
  assert.match(await evaluate(`document.querySelector('#payment-preview-note').textContent`), /Payment preview only/)
})

test('unlinked accounts cannot invent a current rank or pay', async () => {
  await open(390, '?appRoute=%2Fgrading&missingStudent=1')
  await until(`document.querySelector('[role="alert"]') !== null`)
  assert.match(await evaluate(`document.querySelector('[role="alert"]').textContent`), /No student record is linked/)
  assert.equal(await evaluate(`document.querySelector('#target-grade').textContent`), 'Unavailable')
})

test('a checkout option for a skipped grade is not offered', async () => {
  await open(390, '?appRoute=%2Fgrading&grade=brown-4th-kyu')
  await until(`document.querySelector('#target-grade')?.textContent.includes('Blue-Gold (5th Kyu)')`)
  assert.equal(await evaluate(`document.querySelector('#grading-event')`), null)
  assert.match(await evaluate(`document.querySelector('#payment-preview-note').textContent`), /No charge or formal grading application/)
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
  await until(`document.body.textContent.includes('Application submitted:')`)
  assert.equal(await evaluate(`window.gradingCheckoutCalls.filter(c => c.action === 'checkout').length`), 0)
})

test('direct payment without an application cannot start Stripe checkout', async () => {
  await open(320)
  assert.match(await evaluate(`document.body.textContent`), /Select an eligible grading session/)
  assert.equal(await evaluate(`window.gradingCheckoutCalls.length`), 0)
})

test('Proceed to Payment opens Stripe test checkout without an eligible formal session', async () => {
  for (const width of [320, 1440]) {
    await open(width, '?appRoute=%2Fgrading&empty=1')
    await until(`document.querySelector('#payment-preview-note') !== null`)
    assert.match(await evaluate(`document.body.textContent`), /Payment preview only/)
    assert.equal(await evaluate(`document.body.textContent.includes('Stripe test mode')`), false)
    assert.equal(await evaluate(`document.querySelector('h2').textContent`), '1. Grading Details')
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Proceed to Payment')).disabled`), false)
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(process.env.LOCALAPPDATA, 'Temp', 'opencode', `grading-test-checkout-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Proceed to Payment')).click()`)
    await until(`window.gradingCheckoutCalls.some(c => c.action === 'test-checkout')`)
    const body = await evaluate(`window.gradingCheckoutCalls.find(c => c.action === 'test-checkout')`)
    assert.equal(body.expected_amount, 5500)
    assert.equal(body.target_grade_id, 'blue-gold-5th-kyu')
    assert.match(body.request_id, /^[a-f0-9-]{36}$/)
    await until(`location.origin === 'https://checkout.stripe.com'`)
  }
})

test('test success is verified without claiming a formal application was submitted', async () => {
  await open(390, '?empty=1&appRoute=' + encodeURIComponent('/grading?checkout=test-success&session_id=cs_test_preview'))
  await until(`document.body.textContent.includes('Payment preview completed.')`)
  assert.match(await evaluate(`document.body.textContent`), /no formal grading application was submitted/)
  assert.equal(await evaluate(`document.body.textContent.includes('Application submitted:')`), false)
  await until(`document.body.textContent.includes('Application draft saved:')`)
  assert.match(await evaluate(`document.body.textContent`), /Your application draft has been saved/)
})

test('previously saved application drafts reload from the database on a fresh visit', async () => {
  await open(390, '?empty=1&savedDraft=1&appRoute=%2Fgrading')
  await until(`document.body.textContent.includes('Application draft saved:')`)
  assert.match(await evaluate(`document.body.textContent`), /Blue-Gold \(5th Kyu\).*Payment preview completed/)
})

test('test checkout errors preserve a retry without pretending payment succeeded', async () => {
  await open(390, '?appRoute=%2Fgrading&empty=1&rpc=fail')
  await until(`document.querySelector('#payment-preview-note') !== null`)
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Proceed to Payment')).click()`)
  await until(`document.querySelector('[role="alert"]') !== null`)
  assert.match(await evaluate(`document.querySelector('[role="alert"]').textContent`), /Unable to contact checkout/)
  assert.equal(await evaluate(`document.body.textContent.includes('payment confirmed')`), false)
})
