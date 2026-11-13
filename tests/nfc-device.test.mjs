import assert from 'node:assert/strict'
import test from 'node:test'
import { currentDeviceSupportsNfcCheckIn, supportsNfcCheckIn } from '../src/lib/nfc-device.ts'

const androidChrome = version => `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version}.0.0.0 Mobile Safari/537.36`
const supported = { userAgent: androidChrome(131), secureContext: true, hasNdefReader: true }

test('NFC readiness supports Android phones and tablets with Web NFC on Chrome 89+', () => {
  assert.equal(supportsNfcCheckIn(supported), true)
  assert.equal(supportsNfcCheckIn({ ...supported, userAgent: androidChrome(89) }), true)
  assert.equal(supportsNfcCheckIn({ ...supported, userAgent: supported.userAgent.replace(' Mobile', '') }), true)
  assert.equal(supportsNfcCheckIn({ ...supported, userAgent: 'Reduced browser user agent', platform: 'Android' }), true)
})

test('Edge and other Chromium Android browsers require actual Web NFC API support', () => {
  for (const suffix of [' EdgA/131.0.0.0', ' SamsungBrowser/26.0']) {
    assert.equal(supportsNfcCheckIn({ ...supported, userAgent: supported.userAgent + suffix }), true)
    assert.equal(supportsNfcCheckIn({ ...supported, userAgent: supported.userAgent + suffix, hasNdefReader: false }), false)
  }
})

test('old Chrome, missing Web NFC and insecure pages cannot show NFC readiness', () => {
  for (const change of [
    { userAgent: androidChrome(88) }, { hasNdefReader: false }, { secureContext: false },
  ]) assert.equal(supportsNfcCheckIn({ ...supported, ...change }), false)
})

test('iPhones, iPads, desktops and Android Firefox use QR check-in instead', () => {
  for (const userAgent of [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  ]) assert.equal(supportsNfcCheckIn({ userAgent, secureContext: true, hasNdefReader: false }), false)
  assert.equal(supportsNfcCheckIn({ ...supported, userAgent: 'Desktop Chrome/131.0', platform: 'Windows' }), false)
})

test('device detection is safe outside the browser', () => {
  assert.equal(currentDeviceSupportsNfcCheckIn(), false)
})
