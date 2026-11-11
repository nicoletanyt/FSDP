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

async function inspect(width, device, tag = false, navigate = false) {
  const result = await request(`/session/${session}/execute/async`, { args: [width, device, tag, navigate], script: `
    const [width, device, tag, navigate, done] = arguments;
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
      const link = d.querySelector('a');
      const result = { text: d.body.textContent, fits: d.documentElement.scrollWidth <= d.documentElement.clientWidth,
        calls: w.nfcFixtureCalls, pendingTag: w.sessionStorage.getItem('fsdp-pending-nfc-tag'),
        href: link?.getAttribute('href'), targets: link ? { width: link.getBoundingClientRect().width, height: link.getBoundingClientRect().height, bottom: link.getBoundingClientRect().bottom } : null };
      if (navigate) { link.click(); await new Promise(resolve => setTimeout(resolve, 100)); result.afterNavigation = d.body.textContent; }
      done(result);
    })().catch(error => done({ error: String(error) }));
  ` })
  assert.equal(result.error, undefined)
  return result
}

test('NFC-compatible Android phones, tablets and Edge show ready for a scan at mobile/tablet/desktop widths', async () => {
  for (const [width, device] of [[320, 'android'], [768, 'tablet'], [1280, 'edge']]) {
    const result = await inspect(width, device)
    assert.match(result.text, /Ready for a scan/)
    assert.match(result.text, /Make sure NFC is enabled/)
    assert.doesNotMatch(result.text, /Please try a valid device/)
    assert.equal(result.calls, 0)
    assert.equal(result.fits, true)
  }
})

test('unsupported devices show the compatible-device list and a working QR-only fallback', async () => {
  for (const [width, device] of [[320, 'ios'], [768, 'desktop'], [1280, 'no-api'], [390, 'old-chrome'], [390, 'insecure']]) {
    const result = await inspect(width, device, false, true)
    assert.match(result.text, /Please try a valid device/)
    assert.match(result.text, /This device can only handle QR check-in/)
    assert.match(result.text, /Android phones with NFC hardware, running Chrome 89 or later/)
    assert.match(result.text, /Android tablets with NFC hardware, running Chrome 89 or later/)
    assert.match(result.text, /Edge or another Chromium-based Android browser with Web NFC support/)
    assert.doesNotMatch(result.text, /Ready for a scan/)
    assert.equal(result.href, '/instructor/check-in')
    assert.equal(result.calls, 0)
    assert.equal(result.fits, true)
    assert.ok(result.targets.height >= 44)
    assert.ok(result.targets.bottom <= 700, 'QR fallback is visible without scrolling')
    assert.match(result.afterNavigation, /QR check-in fixture/)
  }
})

test('unsupported devices discard a captured tag without submitting attendance, while supported devices keep the existing flow', async () => {
  const blocked = await inspect(390, 'desktop', true)
  assert.equal(blocked.calls, 0)
  assert.equal(blocked.pendingTag, null)
  assert.match(blocked.text, /This device can only handle QR check-in/)
  const allowed = await inspect(390, 'android', true)
  assert.equal(allowed.calls, 1)
  assert.match(allowed.text, /No class today/)
  assert.equal(allowed.pendingTag, null)
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
