// Chrome fixture uses production Centres and loadCalendarCentres, but no live Supabase calls.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5184'
const chromePath = process.env.CHROME_PATH ?? 'google-chrome-stable'
let chrome, profileDir, socket
let requestId = 0
const pending = new Map()
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

function send(method, params = {}) {
  const id = ++requestId
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
  profileDir = await mkdtemp('/tmp/opencode/centres-browser-')
  chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 20000)
    chrome.once('error', error => { clearTimeout(timeout); reject(error) })
    chrome.stderr.on('data', chunk => {
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(String(chunk))
      if (match) { clearTimeout(timeout); resolve(Number(match[1])) }
    })
  })
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  socket.onmessage = event => {
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
    const exited = new Promise(resolve => chrome.once('exit', resolve))
    chrome.kill()
    await exited
  }
  if (profileDir) await rm(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 })
})

async function open(width, query = '') {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${origin}/tests/mobile-responsive/centres.html${query}` })
  await until(`document.querySelector('h1')?.textContent === 'Centres'`)
  await until(`!document.body.textContent.includes('Loading dojos')`)
}

test('live centre rows, status counts and existing search filter render without overflow', async () => {
  for (const width of [320, 390, 768, 1440]) {
    await open(width)
    const text = await evaluate('document.body.textContent')
    assert.match(text, /Showing 3 of 3 dojos/)
    for (const name of ['Central Dojo', 'East Dojo', 'West Dojo']) assert.ok(text.includes(name))
    assert.equal(await evaluate('window.centreFixtureCalls'), 1)
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${width}px overflow`)
  }
  await evaluate(`(() => {
    const input = document.querySelector('input[aria-label="Search dojos"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'East')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await until(`document.body.textContent.includes('Showing 1 of 3 dojos')`)
  assert.match(await evaluate('document.body.textContent'), /East Dojo/)
})

test('an empty database and failed read never display mock centres', async () => {
  await open(390, '?state=empty')
  assert.match(await evaluate('document.body.textContent'), /No dojos yet/)
  assert.equal(await evaluate('window.centreFixtureCalls'), 1)
  await open(390, '?state=error')
  const text = await evaluate('document.body.textContent')
  assert.match(text, /Unable to load dojos/)
  assert.doesNotMatch(text, /Central Dojo|No dojos yet/)
  await evaluate(`document.querySelector('button').click()`)
  await until(`window.centreFixtureCalls === 2`)
})

test('legacy Students tab redirects with other parameters intact', async () => {
  await send('Page.navigate', { url: `${origin}/tests/mobile-responsive/centres.html?filters=tab%3Dstudents%26dojoQ%3DEast` })
  await until(`document.body.textContent.includes('Student directory fixture')`)
  const text = await evaluate('document.body.textContent')
  assert.match(text, /dojoQ=East/)
  assert.doesNotMatch(text, /tab=students/)
})
