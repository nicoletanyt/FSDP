import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const source = stripTypeScriptTypes(await readFile(new URL('../src/hooks/use-check-in-alternation.ts', import.meta.url), 'utf8'))
  .replaceAll("'react'", JSON.stringify(import.meta.resolve('react')))
const { useCheckInAlternation } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('automatic QR/NFC windows release the camera before NFC, freeze during check-in and resume without clicks', async () => {
  const timers = new Map()
  let nextTimer = 0, pauses = 0, resumes = 0, current
  globalThis.window = {
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, ms }); return id },
    clearTimeout: id => timers.delete(id),
  }
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }
  const pauseNfc = () => { pauses++ }
  const resumeNfc = () => { resumes++ }
  const locked = () => false
  let options = {
    cameraEnabled: true, cameraRunning: true, cameraLive: true, cameraFailed: false,
    nfcWanted: true, nfcState: 'active', nfcError: '', pauseNfc, resumeNfc, stopNfc() {}, busy: false, locked,
  }
  function Harness({ settings }) { current = useCheckInAlternation(settings); return null }
  let root
  const update = async changes => {
    options = { ...options, ...changes }
    await act(async () => { root.update(React.createElement(Harness, { settings: options })) })
  }
  const advance = async ms => {
    const timer = [...timers.values()].find(item => item.ms === ms)
    assert.ok(timer, `expected a ${ms}ms listening window`)
    await act(async () => { timer.fn() })
  }
  await act(async () => { root = TestRenderer.create(React.createElement(Harness, { settings: options })) })
  assert.equal(current.phase, 'qr')
  assert.equal(pauses, 1)
  await advance(2000)
  assert.equal(current.phase, 'nfc')
  assert.equal(current.cameraPaused, true)
  assert.equal(resumes, 0, 'do not start NFC until the camera has released')
  await update({ cameraRunning: false, cameraLive: false, nfcState: 'idle' })
  assert.equal(resumes, 1)
  await update({ nfcState: 'active' })
  await update({ busy: true })
  assert.equal(timers.size, 0, 'confirmation or class choice freezes the cycle')
  await update({ busy: false })
  await advance(2000)
  assert.equal(current.phase, 'qr')
  assert.equal(current.cameraPaused, false)
  assert.equal(pauses, 2)
  await update({ nfcWanted: false })
  assert.equal(current.alternating, false)
  await act(async () => { root.unmount() })
  assert.equal(timers.size, 0)
})

test('camera failure falls back to NFC instead of leaving both readers off', async () => {
  globalThis.window = { setTimeout, clearTimeout }
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }
  let result, resumed = 0
  function Harness() {
    result = useCheckInAlternation({ cameraEnabled: true, cameraRunning: false, cameraLive: false,
      cameraFailed: true, nfcWanted: true, nfcState: 'idle', nfcError: '', pauseNfc() {}, stopNfc() {},
      resumeNfc() { resumed++ }, busy: false, locked: () => false })
    return null
  }
  let root
  await act(async () => { root = TestRenderer.create(React.createElement(Harness)) })
  assert.equal(result.alternating, false)
  assert.ok(resumed >= 1)
  await act(async () => { root.unmount() })
})

test('failed NFC restart does not leave the camera paused indefinitely', async () => {
  const timers = new Map()
  let sequence = 0, stopped = 0, result
  globalThis.window = {
    setTimeout: (fn, ms) => { timers.set(++sequence, { fn, ms }); return sequence },
    clearTimeout: id => timers.delete(id),
  }
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} }
  const stopNfc = () => { stopped++ }
  const pauseNfc = () => {}
  const resumeNfc = () => {}
  const locked = () => false
  let settings = { cameraEnabled: true, cameraRunning: true, cameraLive: true, cameraFailed: false,
    nfcWanted: true, nfcState: 'active', nfcError: '', pauseNfc, resumeNfc, stopNfc, busy: false, locked }
  function Harness({ options }) { result = useCheckInAlternation(options); return null }
  let root
  await act(async () => { root = TestRenderer.create(React.createElement(Harness, { options: settings })) })
  await act(async () => { [...timers.values()].find(timer => timer.ms === 2000).fn() })
  settings = { ...settings, cameraRunning: false, cameraLive: false, nfcState: 'idle', nfcError: 'NFC unavailable' }
  await act(async () => { root.update(React.createElement(Harness, { options: settings })) })
  assert.equal(stopped, 1)
  settings = { ...settings, nfcWanted: false }
  await act(async () => { root.update(React.createElement(Harness, { options: settings })) })
  assert.equal(result.cameraPaused, false)
  await act(async () => { root.unmount() })
})
