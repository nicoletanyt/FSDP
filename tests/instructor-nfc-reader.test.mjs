import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const deviceStub = moduleUrl('export const currentDeviceSupportsNfcCheckIn = () => true')
const parserStub = moduleUrl('export const tokenFromNdefRecords = records => records[0]?.token ?? null')
const source = stripTypeScriptTypes(await readFile(new URL('../src/hooks/use-nfc-reader.ts', import.meta.url), 'utf8'))
  .replaceAll("'react'", JSON.stringify(import.meta.resolve('react')))
  .replaceAll("'@/lib/nfc-device'", JSON.stringify(deviceStub))
  .replaceAll("'@/lib/nfc-tag-reader'", JSON.stringify(parserStub))
const { useNfcReader } = await import(moduleUrl(source))

test('reader only auto-starts with granted permission, serializes taps, and stops cleanly', async () => {
  let permission = 'prompt', reader, scans = 0, blocked = false
  const events = new Map()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { origin: 'https://example.test' },
    NDEFReader: class {
      constructor() { reader = this }
      async scan({ signal }) { assert.equal(signal.aborted, false); scans++; signal.addEventListener('abort', () => { reader = null }) }
    },
  } })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { permissions: { query: async () => ({ state: permission }) } } })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    visibilityState: 'visible', addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
  } })
  let hook, received = []
  function Harness() { hook = useNfcReader(token => received.push(token), () => blocked); return null }
  let root
  await act(async () => { root = TestRenderer.create(React.createElement(Harness)) })
  assert.equal(scans, 0, 'prompt permission must not start a reader')
  await act(async () => { await hook.start() })
  assert.equal(scans, 1)
  await act(async () => { reader.onreading({ message: { records: [{ token: 'first' }] } }) })
  assert.deepEqual(received, ['first'])
  blocked = true
  await act(async () => { reader.onreading({ message: { records: [{ token: 'second' }] } }) })
  assert.deepEqual(received, ['first'], 'no concurrent NFC submission')
  assert.equal(hook.readCount, 2, 'token-free diagnostics still record the hardware read event')
  blocked = false
  await act(async () => { reader.onreading({ message: { records: [{ token: 'second' }] } }) })
  assert.deepEqual(received, ['first', 'second'])
  assert.equal(hook.readCount, 3)
  await act(async () => { hook.stop() })
  assert.equal(reader, null)
  permission = 'granted'
  await act(async () => { events.get('visibilitychange')() })
  assert.equal(scans, 1, 'manual stop prevents permission-based restart')
  await act(async () => { root.unmount() })
})

test('granted permission auto-starts without an NFC token submission', async () => {
  let scans = 0, submissions = 0
  window.NDEFReader = class { async scan() { scans++ } }
  navigator.permissions.query = async () => ({ state: 'granted' })
  let root
  function Harness() { useNfcReader(() => { submissions++ }, () => false); return null }
  await act(async () => { root = TestRenderer.create(React.createElement(Harness)) })
  assert.equal(scans, 1)
  assert.equal(submissions, 0)
  await act(async () => { root.unmount() })
})
