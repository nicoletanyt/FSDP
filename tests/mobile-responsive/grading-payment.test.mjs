// Real Chrome, production components and routes; only auth/RPC are fixture data.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
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
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(JSON.stringify(message.error)))
    else request.resolve(message.result)
  }
  await send('Page.enable')
  await send('Runtime.enable')
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
  await until(`document.querySelector('button[type="submit"]') !== null`)
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

test('grading entry shows three keyboard-native payment choices without overflow at 320–1440px', async () => {
  for (const width of [320, 390, 768, 1440]) {
    await open(width, '?appRoute=%2Fgrading')
    assert.equal(await evaluate(`location.pathname`), '/grading')
    assert.equal(await evaluate(`document.querySelectorAll('input[name="payment-method"]').length`), 3)
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true, `${width}px`)
    assert.ok(await evaluate(`document.querySelector('#grading-rank') !== null`))
  }
})

test('grade and track changes recalculate the total; late deadline adds S$22', async () => {
  await open(390)
  await setValue('grading-rank', '4-dan')
  await setValue('grading-deadline', '2020-01-01')
  assert.match(await evaluate(`document.querySelector('form button[type="submit"]').textContent`), /932\.00/)
  assert.match(await evaluate(`document.body.textContent`), /S\$22 is added/)
  await setValue('grading-track', 'children')
  await setValue('grading-rank', '12-kyu')
  assert.match(await evaluate(`document.querySelector('form button[type="submit"]').textContent`), /67\.00/)
  await setValue('grading-track', 'adult')
  assert.equal(await evaluate(`document.querySelector('#grading-rank').value`), '6-kyu')
  assert.match(await evaluate(`document.querySelector('form button[type="submit"]').textContent`), /72\.00/)
})

test('each method completes a demo receipt; preview does not save a real application', async () => {
  for (const [method, label] of [['card', 'Credit / debit card'], ['paynow', 'PayNow'], ['bank_transfer', 'Bank transfer']]) {
    await open(390, '?deadline=2020-01-01')
    await evaluate(`document.querySelector('input[value="${method}"]').click()`)
    await wait(100)
    if (method !== 'card') assert.equal(await evaluate(`document.querySelector('#card-number') === null`), true)
    await evaluate(`document.querySelector('button[type="submit"]').click()`)
    await until(`document.body.textContent.includes('Processing...')`)
    await until(`document.body.textContent.includes('Payment Successful')`)
    const receipt = await evaluate(`document.querySelector('dl.divide-y').textContent`)
    assert.ok(receipt.includes(label), receipt)
    assert.match(receipt, /60\.00/)
    assert.match(receipt, /22\.00/)
    assert.match(receipt, /82\.00/)
    assert.equal(await evaluate(`window.gradingPaymentRpcCalls ?? 0`), 0)
    assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
  }
})

test('application context locks target/deadline and saves once; errors retain retry', async () => {
  await open(390, '?application=1&grade=3-kyu&deadline=2020-01-01')
  assert.equal(await evaluate(`document.querySelector('#grading-rank') === null`), true)
  assert.equal(await evaluate(`document.querySelector('#grading-deadline') === null`), true)
  assert.match(await evaluate(`document.querySelector('button[type="submit"]').textContent`), /87\.00/)
  await evaluate(`document.querySelector('button[type="submit"]').click()`)
  await until(`document.body.textContent.includes('Application saved')`)
  assert.equal(await evaluate(`window.gradingPaymentRpcCalls`), 1)
  await open(390, '?application=1&rpc=fail')
  await evaluate(`document.querySelector('button[type="submit"]').click()`)
  await until(`document.body.textContent.includes('Try saving again')`)
  assert.match(await evaluate(`document.querySelector('[role="alert"]').textContent`), /Fixture RPC failure/)
})

test('card errors are recoverable and do not block a different payment method', async () => {
  await open(320)
  await setValue('card-number', '12')
  await evaluate(`document.querySelector('button[type="submit"]').click()`)
  await until(`document.querySelector('#payment-error') !== null`)
  assert.match(await evaluate(`document.querySelector('#payment-error').textContent`), /16-digit/)
  await evaluate(`document.querySelector('input[value="paynow"]').click()`)
  await wait(100)
  assert.equal(await evaluate(`document.querySelector('#payment-error') === null`), true)
  await evaluate(`document.querySelector('button[type="submit"]').click()`)
  await until(`document.body.textContent.includes('Payment Successful')`)
  assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth`), true)
})

test('unknown application grade blocks payment instead of using a made-up default fee', async () => {
  await open(390, '?application=1&grade=unknown')
  assert.equal(await evaluate(`document.querySelector('button[type="submit"]').disabled`), true)
  assert.match(await evaluate(`document.body.textContent`), /Unavailable/)
  assert.equal(await evaluate(`window.gradingPaymentRpcCalls ?? 0`), 0)
})
