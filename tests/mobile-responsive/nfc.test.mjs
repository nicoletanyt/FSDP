import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { writeFile } from 'node:fs/promises'

const origin = process.env.FSDP_BASE_URL ?? 'http://127.0.0.1:5173'
const webdriver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444'
let session
async function request(path, body, method = 'POST') {
  const response = await fetch(`${webdriver}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const result = await response.json()
  if (!response.ok) throw new Error(JSON.stringify(result))
  return result.value
}
before(async () => {
  const created = await request('/session', { capabilities: { alwaysMatch: { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] } } } })
  session = created.sessionId
  await request(`/session/${session}/url`, { url: `${origin}/tests/mobile-responsive/nfc.html` })
})
after(async () => { if (session) await request(`/session/${session}`, undefined, 'DELETE') })

async function inspect(width, device, tag = false, action = '') {
  const result = await request(`/session/${session}/execute/async`, { args: [width, device, tag, action], script: `
    const [width, device, tag, action, done] = arguments;
    (async () => {
      document.querySelectorAll('iframe').forEach(frame => frame.remove());
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;top:0;left:0;border:0;width:' + width + 'px;height:700px;z-index:100';
      document.body.append(frame);
      await new Promise(resolve => {
        frame.onload = () => setTimeout(resolve, 600);
        frame.src = '/tests/mobile-responsive/nfc.html?device=' + device + (tag ? '&tag=true' : '');
      });
      const w = frame.contentWindow, d = w.document;
       const result = { text: d.body.textContent, fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth,
         calls: w.nfcFixtureCalls, scans: w.nfcFixtureScans, pendingTag: w.sessionStorage.getItem('fsdp-pending-nfc-tag') };
       if (action === 'scan' || action === 'select') {
         if (action === 'select') w.nfcFixtureRespond('select_class');
         [...d.querySelectorAll('button')].find(button => button.textContent.includes('Start scanning')).click();
         await new Promise(resolve => setTimeout(resolve, 50));
         result.started = d.body.textContent;
         w.nfcFixtureEmit();
         w.nfcFixtureEmit();
         await new Promise(resolve => setTimeout(resolve, 50));
         result.first = { text: d.body.textContent, calls: w.nfcFixtureCalls };
         if (action === 'select') {
           w.nfcFixtureEmit('b'.repeat(64));
           await new Promise(resolve => setTimeout(resolve, 50));
           result.whileChoosing = w.nfcFixtureCalls;
           w.nfcFixtureRespond('no_class');
           [...d.querySelectorAll('button')].find(button => button.textContent.includes('Demo class')).click();
           await new Promise(resolve => setTimeout(resolve, 50));
           result.afterChoice = w.nfcFixtureCalls;
         }
         w.nfcFixtureEmit('b'.repeat(64));
         await new Promise(resolve => setTimeout(resolve, 50));
         result.second = { text: d.body.textContent, calls: w.nfcFixtureCalls, scans: w.nfcFixtureScans };
         [...d.querySelectorAll('button')].find(button => button.textContent.includes('Stop scanning')).click();
         w.nfcFixtureEmit('c'.repeat(64));
         await new Promise(resolve => setTimeout(resolve, 50));
         result.stopped = { calls: w.nfcFixtureCalls, text: d.body.textContent };
       }
      done(result);
    })().catch(error => done({ error: String(error) }));
  ` })
  assert.equal(result.error, undefined)
  return result
}

test('supported Android devices show a first-time start control without requesting permission', async () => {
  for (const [width, device] of [[320, 'android'], [768, 'tablet'], [1280, 'edge']]) {
    const result = await inspect(width, device)
    assert.match(result.text, /Start scanning to check in/)
    assert.doesNotMatch(result.text, /Please try a valid device/)
    assert.equal(result.calls, 0)
    assert.equal(result.scans, 0)
    assert.equal(result.fits, true)
  }
})

test('granted NFC permission starts scanning on page open', async () => {
  const result = await inspect(390, 'granted')
  assert.match(result.text, /Scanning is active/)
  assert.equal(result.scans, 1)
  assert.equal(result.calls, 0)
})

test('one reader handles successive tags without duplicate submissions or navigation, and stops on request', async () => {
  const result = await inspect(320, 'android', false, 'scan')
  assert.match(result.started, /Scanning is active/)
  assert.equal(result.first.calls, 1)
  assert.equal(result.second.calls, 2)
  assert.equal(result.second.scans, 1)
  assert.match(result.second.text, /No class today/)
  assert.equal(result.stopped.calls, 2)
  assert.match(result.stopped.text, /Start scanning/)
})

test('a class choice blocks new reads until the instructor chooses', async () => {
  const result = await inspect(390, 'android', false, 'select')
  assert.match(result.first.text, /Choose a class for Test student/)
  assert.equal(result.whileChoosing, 1)
  assert.equal(result.afterChoice, 2)
  assert.equal(result.second.calls, 3)
})

test('browsers without Web NFC still show the NFC URL fallback, without a scan control', async () => {
  for (const [width, device] of [[320, 'ios'], [768, 'desktop'], [1280, 'no-api'], [390, 'old-chrome'], [390, 'insecure']]) {
    const result = await inspect(width, device)
    assert.match(result.text, /Ready for a tag link/)
    assert.match(result.text, /Open an existing NFC tag’s URL to check in/)
    assert.doesNotMatch(result.text, /Start scanning to check in/)
    assert.doesNotMatch(result.text, /Stop scanning/)
    assert.equal(result.calls, 0)
    assert.equal(result.scans, 0)
    assert.equal(result.fits, true)
  }
})

test('captured URL tags still submit attendance without Web NFC or device checks', async () => {
  for (const device of ['desktop', 'ios', 'old-chrome', 'insecure', 'android']) {
    const result = await inspect(390, device, true)
    assert.equal(result.calls, 1)
    assert.match(result.text, /No class today/)
    assert.equal(result.pendingTag, null)
  }
})

// Optional, test-only screenshots for a batched visual review of both states.
if (process.env.NFC_SCREENSHOT_DIR) {
  test('capture NFC compatibility states', async () => {
    for (const [width, device] of [[320, 'ios'], [768, 'tablet'], [1280, 'desktop']]) {
      await inspect(width, device)
      const screenshot = await request(`/session/${session}/screenshot`, undefined, 'GET')
      await writeFile(`${process.env.NFC_SCREENSHOT_DIR}/nfc-${width}-${device}.png`, Buffer.from(screenshot, 'base64'))
    }
  })
}
