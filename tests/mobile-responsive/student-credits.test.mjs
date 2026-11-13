import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5180'
const temp = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : process.env.TEMP
let chrome, profileDir, socket, id = 0
const requests = new Map()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function send(method, params = {}) {
  const requestId = ++id
  return new Promise((resolve, reject) => {
    requests.set(requestId, { resolve, reject })
    socket.send(JSON.stringify({ id: requestId, method, params }))
  })
}

async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true })
  if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
  return response.result.value
}

async function until(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(expression)) return
    await wait(100)
  }
  throw new Error(`Timed out: ${expression}`)
}

before(async () => {
  profileDir = await mkdtemp(join(temp, 'student-credits-browser-'))
  chrome = spawn(process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Chrome startup timeout')), 20000)
    chrome.once('error', reject)
    chrome.stderr.on('data', (chunk) => {
      const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(String(chunk))
      if (match) { clearTimeout(timeout); resolve(Number(match[1])) }
    })
  })
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    const request = requests.get(message.id)
    if (!request) return
    requests.delete(message.id)
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

async function open(width, scenario) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${origin}/tests/mobile-responsive/student-credits.html?scenario=${scenario}` })
  await until(`document.querySelector('h3') !== null`)
}

test('dashboard waits for the paid receipt, then renders database balance at mobile and desktop sizes', async () => {
  for (const width of [320, 1440]) {
    await open(width, 'paid')
    await until(`document.body.textContent.includes('Confirming your payment')`)
    await until(`document.body.textContent.includes('Payment confirmed.')`)
    assert.equal(await evaluate(`document.querySelector('[aria-live="polite"]').textContent`), '35')
    const screenshot = await send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(temp, `student-credits-${width}.png`), Buffer.from(screenshot.data, 'base64'))
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true,
      JSON.stringify(await evaluate(`Array.from(document.querySelectorAll('body *')).filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right})).slice(0, 12)`)))
  }
})

test('dashboard surfaces database failures with a retry instead of a cached number', async () => {
  await open(320, 'error')
  await until(`document.body.textContent.includes('Unable to load your credits')`)
  assert.equal(await evaluate(`document.querySelector('[aria-live="polite"]').textContent`), 'Unavailable')
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(button => button.textContent.includes('Refresh balance'))`), true)
})

test('dashboard shows unlimited from the database flag', async () => {
  await open(390, 'unlimited')
  await until(`document.querySelector('[aria-live="polite"]')?.textContent === 'Unlimited'`)
})
