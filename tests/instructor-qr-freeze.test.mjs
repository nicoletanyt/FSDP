import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const source = stripTypeScriptTypes(await readFile(new URL('../src/hooks/use-qr-camera.ts', import.meta.url), 'utf8'))
  .replaceAll("'react'", JSON.stringify(import.meta.resolve('react')))
  .replaceAll("'jsqr'", JSON.stringify(import.meta.resolve('jsqr')))
const { useQrCamera } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('NFC window shows the final camera frame after the video track stops; manual stop clears it', async () => {
  let stopped = false, captures = 0
  globalThis.requestAnimationFrame = () => 1
  globalThis.cancelAnimationFrame = () => {}
  const frozen = { width: 0, height: 0, getContext: () => ({ drawImage: () => {
    assert.equal(stopped, false, 'capture before stopping the stream')
    captures++
  } }) }
  const video = { srcObject: null, readyState: 2, videoWidth: 640, videoHeight: 480, play: async () => {} }
  globalThis.document = {
    hidden: false, addEventListener() {}, removeEventListener() {},
    createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData() { throw Error('no scan requested') } }) }),
  }
  const track = { stop: () => { stopped = true }, getSettings: () => ({ deviceId: 'camera-1' }), addEventListener() {} }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  Object.defineProperty(globalThis, 'navigator', { configurable: true,
    value: { mediaDevices: { getUserMedia: async () => stream, enumerateDevices: async () => [] } } })
  let camera
  function Harness({ enabled, freezeOnStop }) {
    camera = useQrCamera({ enabled, freezeOnStop, cameraId: '', paused: false, onScan() {} })
    return React.createElement(React.Fragment, null,
      React.createElement('video', { ref: camera.videoRef }),
      React.createElement('canvas', { ref: camera.frozenCanvasRef }))
  }
  const render = (enabled, freezeOnStop) => React.createElement(Harness, { enabled, freezeOnStop })
  let root
  await act(async () => { root = TestRenderer.create(render(true, false), {
    createNodeMock: element => element.type === 'video' ? video : frozen,
  }) })
  assert.equal(camera.status, 'live')
  await act(async () => { root.update(render(false, true)) })
  assert.equal(captures, 1)
  assert.equal(stopped, true)
  assert.equal(video.srcObject, null)
  assert.equal(camera.hasFrozenFrame, true)
  assert.equal(frozen.width, 640)
  let finishPlay
  video.play = () => new Promise(resolve => { finishPlay = resolve })
  await act(async () => { root.update(render(true, false)) })
  assert.equal(camera.status, 'starting')
  assert.equal(camera.hasFrozenFrame, true, 'keep the still frame while the camera restarts')
  await act(async () => { finishPlay() })
  assert.equal(camera.status, 'live')
  assert.equal(camera.hasFrozenFrame, false)
  stopped = false // Simulate a fresh live track after the camera restarts.
  await act(async () => { root.update(render(false, true)) })
  assert.equal(camera.hasFrozenFrame, true)
  await act(async () => { root.update(render(false, false)) })
  assert.equal(camera.hasFrozenFrame, false)
  assert.equal(frozen.width, 0)
  await act(async () => { root.unmount() })
})
