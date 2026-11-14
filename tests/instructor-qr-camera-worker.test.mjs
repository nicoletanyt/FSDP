import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const source = stripTypeScriptTypes(await readFile(new URL('../src/hooks/use-qr-camera.ts', import.meta.url), 'utf8'))
  .replaceAll("'react'", JSON.stringify(import.meta.resolve('react')))
  .replace("new URL('../workers/qr-decode.worker.ts', import.meta.url)", "new URL('https://example.test/qr-decode.worker.js')")
const { useQrCamera } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('camera sends one frame at a time to a worker, handles a decoded QR, and releases the stream', async () => {
  const frames = new Map(), posts = [], codes = []
  let frameId = 0, worker, stopped = false
  globalThis.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId }
  globalThis.cancelAnimationFrame = id => frames.delete(id)
  globalThis.document = {
    hidden: false, addEventListener() {}, removeEventListener() {},
    createElement: () => ({ width: 0, height: 0, getContext() {
      return { drawImage() {}, getImageData: (_x, _y, width, height) =>
        ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) }
    } }),
  }
  const track = { stop: () => { stopped = true }, getSettings: () => ({ deviceId: 'camera-1' }), addEventListener() {} }
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  Object.defineProperty(globalThis, 'navigator', { configurable: true,
    value: { mediaDevices: { getUserMedia: async () => stream, enumerateDevices: async () => [] } } })
  globalThis.Worker = class {
    constructor() { worker = this; this.terminated = false }
    postMessage(message, transfer) { posts.push({ message, transfer }) }
    terminate() { this.terminated = true }
  }
  const video = { srcObject: null, readyState: 2, videoWidth: 640, videoHeight: 480, play: async () => {} }
  let camera
  function Harness({ enabled, paused }) {
    camera = useQrCamera({ enabled, paused, cameraId: '', onScan: value => codes.push(value) })
    return React.createElement('video', { ref: camera.videoRef })
  }
  let root
  await act(async () => {
    root = TestRenderer.create(React.createElement(Harness, { enabled: true, paused: false }),
      { createNodeMock: () => video })
  })
  assert.equal(camera.status, 'live')
  const firstFrame = frames.get(frameId)
  await act(async () => { firstFrame(1000) })
  assert.equal(posts.length, 1)
  assert.equal(posts[0].transfer[0], posts[0].message.pixels)
  await act(async () => { frames.get(frameId)(1200) })
  assert.equal(posts.length, 1, 'do not queue frames while the worker is decoding')
  await act(async () => { worker.onmessage({ data: { payload: 'offline-test-code' } }) })
  assert.deepEqual(codes, ['offline-test-code'])
  await act(async () => { root.update(React.createElement(Harness, { enabled: false, paused: false })) })
  assert.equal(worker.terminated, true)
  assert.equal(stopped, true)
  await act(async () => { root.unmount() })
})
