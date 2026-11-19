import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const source = stripTypeScriptTypes(await readFile(new URL('../src/hooks/use-check-in-mode.ts', import.meta.url), 'utf8'))
  .replaceAll("'react'", JSON.stringify(import.meta.resolve('react')))
const { useCheckInMode } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('NFC is the default; switching to QR stops NFC and keeps the camera selected until another click', async () => {
  let current, starts = 0, stops = 0
  const startNfc = async () => { starts++ }
  const stopNfc = () => { stops++ }
  let options = { nfcSupported: true, nfcState: 'active', cameraRunning: false, startNfc, stopNfc }
  function Harness({ settings }) { current = useCheckInMode(settings); return null }
  let root
  await act(async () => { root = TestRenderer.create(React.createElement(Harness, { settings: options })) })
  assert.equal(current.mode, 'nfc')
  assert.equal(current.cameraEnabled, false)
  await act(async () => { current.startCamera() })
  assert.equal(current.mode, 'qr')
  assert.equal(current.cameraEnabled, true)
  assert.equal(stops, 1)
  options = { ...options, nfcState: 'idle', cameraRunning: true }
  await act(async () => { root.update(React.createElement(Harness, { settings: options })) })
  assert.equal(starts, 0, 'no automatic restart or timer')
  await act(async () => { current.startNfcScanning() })
  assert.equal(current.mode, 'nfc')
  assert.equal(current.cameraEnabled, false)
  assert.equal(starts, 0, 'camera must be released before NFC starts')
  options = { ...options, cameraRunning: false }
  await act(async () => { root.update(React.createElement(Harness, { settings: options })) })
  assert.equal(starts, 1)
  await act(async () => { root.unmount() })
})

test('first NFC permission can be requested and failed starts can be retried without starting the camera', async () => {
  let current, starts = 0
  const options = { nfcSupported: true, nfcState: 'idle', cameraRunning: false, startNfc: async () => { starts++ }, stopNfc() {} }
  function Harness() { current = useCheckInMode(options); return null }
  let root
  await act(async () => { root = TestRenderer.create(React.createElement(Harness)) })
  await act(async () => { current.startNfcScanning() })
  assert.equal(starts, 1)
  assert.equal(current.cameraEnabled, false)
  await act(async () => { current.startNfcScanning() })
  assert.equal(starts, 2)
  await act(async () => { root.unmount() })
})

test('unsupported devices default to QR and cannot select NFC', async () => {
  let current
  function Harness() { current = useCheckInMode({ nfcSupported: false, nfcState: 'idle', cameraRunning: false, startNfc: async () => { throw Error('unexpected NFC start') }, stopNfc() {} }); return null }
  let root
  await act(async () => { root = TestRenderer.create(React.createElement(Harness)) })
  assert.equal(current.mode, 'qr')
  await act(async () => { current.startNfcScanning() })
  assert.equal(current.cameraEnabled, true)
  await act(async () => { root.unmount() })
})
