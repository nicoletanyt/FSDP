import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import { getInstructorPhoto, prepareInstructorPhoto, saveInstructorPhoto, subscribeInstructorPhotos } from '../src/lib/instructor-calendar.ts'

// Load the frontend-only helpers without adding a test framework or changing app imports.
const source = await readFile(new URL('../src/lib/instructor-availability.ts', import.meta.url), 'utf8')
const calendarUrl = new URL('../src/lib/instructor-calendar.ts', import.meta.url).href
const outputText = stripTypeScriptTypes(source.replace('"./instructor-calendar"', JSON.stringify(calendarUrl)))
const { availabilityError, layoutTimelineItems, mockAvailability, slotDateTime } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const now = new Date(2030, 0, 7, 8, 15) // Monday
const date = new Date(2030, 0, 7)
const range = (startTime, endTime, day = date) => ({ date: day, startTime, endTime })
const slot = { id: 'existing', ...range('09:00', '10:00') }

test('availability rejects duplicates, containment, and partial overlaps; adjacent slots are allowed', () => {
  for (const [start, end] of [['09:00', '10:00'], ['09:15', '09:45'], ['08:30', '10:30'], ['08:30', '09:30'], ['09:30', '10:30']]) {
    assert.match(availabilityError(range(start, end), [slot], undefined, now), /overlaps an existing availability/)
  }
  assert.equal(availabilityError(range('10:00', '10:30'), [slot], undefined, now), null)
  assert.equal(availabilityError(range('08:30', '09:00'), [slot], undefined, now), null)
})

test('editing excludes only the edited slot and still checks other slots', () => {
  assert.equal(availabilityError(range('09:15', '10:00'), [slot], slot.id, now), null)
  assert.match(availabilityError(range('09:15', '10:30'), [slot, { id: 'other', ...range('10:00', '11:00') }], slot.id, now), /overlaps/)
})

test('availability validates bounds, order, invalid values, and past time at save time', () => {
  for (const value of [range('07:30', '09:00'), range('21:00', '22:30'), range('09:00', '09:00'), range('10:00', '09:00'), range('08:00', '09:00'), range('bad', '09:00')]) {
    assert.ok(availabilityError(value, [], undefined, now))
  }
  assert.equal(availabilityError(range('21:30', '22:00'), [], undefined, now), null)
  assert.ok(availabilityError(range('09:00', '10:00'), [], undefined, new Date(2030, 0, 7, 9, 0)))
})

test('availability uses local dates and does not conflict across different days', () => {
  const nextDay = new Date(2030, 0, 8)
  assert.equal(availabilityError(range('09:00', '10:00', nextDay), [slot], undefined, now), null)
  assert.equal(slotDateTime(nextDay, '09:30').getDate(), 8)
  assert.equal(slotDateTime(nextDay, '09:30').getHours(), 9)
  assert.equal(slotDateTime(nextDay, '09:30').getMinutes(), 30)
})

test('empty time selection cannot span a scheduled class', () => {
  assert.match(availabilityError(range('16:30', '17:30'), [], undefined, now), /scheduled class/)
  assert.equal(availabilityError(range('16:30', '17:00'), [], undefined, now), null)
})

test('timeline handles nested and transitive overlaps and reuses lanes for adjacent classes', () => {
  const items = [
    { id: 'a', startTime: '09:00', endTime: '11:00' },
    { id: 'b', startTime: '09:30', endTime: '10:00' },
    { id: 'c', startTime: '10:00', endTime: '12:00' },
    { id: 'd', startTime: '11:30', endTime: '12:30' },
    { id: 'e', startTime: '13:00', endTime: '14:00' },
  ]
  const original = structuredClone(items)
  const layout = layoutTimelineItems(items)
  assert.deepEqual(items, original, 'layout must not mutate calendar data')
  assert.deepEqual(layout.map(({ lane, lanes }) => [lane, lanes]), [[0, 2], [1, 2], [1, 2], [0, 2], [0, 1]])
  assert.equal(layoutTimelineItems([]).length, 0)
  const threeWay = layoutTimelineItems([...items.slice(0, 2), { id: 'f', startTime: '09:45', endTime: '10:15' }])
  assert.deepEqual(threeWay.map(({ lanes }) => lanes), [3, 3, 3])
})

test('mock availability is future-only, non-overlapping, and includes multiple slots per day', () => {
  const slots = mockAvailability(date)
  assert.ok(slots.length >= 2)
  assert.equal(slots[0].date.getTime(), slots[1].date.getTime())
  for (const entry of slots) assert.equal(availabilityError(entry, slots, entry.id, now), null)
})

test('local instructor photos are isolated by ID and notify avatars only after successful changes', () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const values = new Map()
  const events = new EventTarget()
  let failWrites = false
  Object.defineProperty(globalThis, 'window', { configurable: true, value: events })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new DOMException('Storage full', 'QuotaExceededError')
      values.set(key, value)
    },
    removeItem: key => values.delete(key),
  } })
  let changes = 0
  const unsubscribe = subscribeInstructorPhotos(() => changes++)
  const alicePhoto = 'data:image/jpeg;base64,YWxpY2U='
  const bobPhoto = 'data:image/png;base64,Ym9i'
  try {
    assert.equal(getInstructorPhoto(undefined), null)
    assert.equal(getInstructorPhoto('alice'), null)
    saveInstructorPhoto('alice', alicePhoto)
    assert.equal(getInstructorPhoto('alice'), alicePhoto)
    assert.equal(getInstructorPhoto('bob'), null)
    assert.equal(changes, 1)
    saveInstructorPhoto('bob', bobPhoto)
    failWrites = true
    assert.throws(() => saveInstructorPhoto('alice', bobPhoto), /Storage full/)
    assert.equal(getInstructorPhoto('alice'), alicePhoto)
    assert.equal(changes, 2)
    failWrites = false
    saveInstructorPhoto('alice', null)
    assert.equal(getInstructorPhoto('alice'), null)
    assert.equal(getInstructorPhoto('bob'), bobPhoto)
    assert.equal(changes, 3)
    values.set('instructor-profile-photo-v1:broken', 'not an image')
    assert.equal(getInstructorPhoto('broken'), null)
    const unrelated = new Event('storage')
    Object.defineProperty(unrelated, 'key', { value: 'theme' })
    events.dispatchEvent(unrelated)
    assert.equal(changes, 3)
    const otherTabPhoto = new Event('storage')
    Object.defineProperty(otherTabPhoto, 'key', { value: 'instructor-profile-photo-v1:bob' })
    events.dispatchEvent(otherTabPhoto)
    assert.equal(changes, 4)
    unsubscribe()
    saveInstructorPhoto('alice', alicePhoto)
    assert.equal(changes, 4)
  } finally {
    unsubscribe()
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else delete globalThis.localStorage
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete globalThis.window
  }
})

test('photo uploads reject unsupported and oversized files before image processing', async () => {
  await assert.rejects(prepareInstructorPhoto(new File(['document'], 'profile.pdf', { type: 'application/pdf' })), /JPG, PNG or WebP/)
  await assert.rejects(prepareInstructorPhoto(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' })), /5 MB/)
})
