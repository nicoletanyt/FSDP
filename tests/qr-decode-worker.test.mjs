import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import QRCode from 'qrcode'

const messages = []
globalThis.self = { onmessage: null, postMessage: message => messages.push(message) }
const source = stripTypeScriptTypes(await readFile(new URL('../src/workers/qr-decode.worker.ts', import.meta.url), 'utf8'))
  .replaceAll("'jsqr'", JSON.stringify(import.meta.resolve('jsqr')))
await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('background QR decoder reads an offline synthetic attendance-shaped code', () => {
  const payload = 'ASK:ATT:v1:offline-test-code'
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' })
  const scale = 6, quiet = 4, side = (qr.modules.size + quiet * 2) * scale
  const pixels = new Uint8ClampedArray(side * side * 4)
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const moduleX = Math.floor(x / scale) - quiet
      const moduleY = Math.floor(y / scale) - quiet
      const dark = moduleX >= 0 && moduleY >= 0 && moduleX < qr.modules.size && moduleY < qr.modules.size
        && qr.modules.get(moduleX, moduleY)
      const index = (y * side + x) * 4
      pixels[index] = pixels[index + 1] = pixels[index + 2] = dark ? 0 : 255
      pixels[index + 3] = 255
    }
  }
  self.onmessage({ data: { pixels: pixels.buffer, width: side, height: side } })
  assert.deepEqual(messages.pop(), { payload })
})

test('bad frames fail closed without exposing image data', () => {
  self.onmessage({ data: { pixels: new ArrayBuffer(0), width: 3, height: 3 } })
  const message = messages.pop()
  assert.equal(message.payload, null)
  assert.ok(message.failed || message.payload === null)
  assert.equal('pixels' in message, false)
})
