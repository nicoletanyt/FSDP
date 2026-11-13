import assert from 'node:assert/strict'
import test from 'node:test'
import { api, decoders, calendarView, errors } from './helpers/instructor-modules.mjs'

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const userId = uuid(1), instructorId = uuid(2), slotId = uuid(3), requestId = uuid(4)
const expected = { date: '2030-01-07', startTime: '09:00:30', endTime: '11:00:00' }
const value = { date: '2030-01-08', startTime: '12:00', endTime: '13:00' }
const row = { id: slotId, instructor_id: instructorId, date: value.date, start_time: '12:00:00', end_time: '13:00:00' }
const input = { requestId, expectedUserId: userId, slotId, expected, kind: 'update', value }
const receipt = { requestId, slotId, kind: 'update', slot: row }

function fixture({ account = userId, response = receipt, error = null, record = row } = {}) {
  const requests = [], filters = []
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: account } }, error: null }) },
    from(table) {
      return {
        select() { return this },
        eq(column, value) { filters.push([table, column, value]); return this },
        async maybeSingle() {
          return { error: null, data: table === 'users' ? { id: account, role: 'instructor' }
            : table === 'instructors' ? { id: instructorId, user_id: account, first_name: 'Test', last_name: 'Teacher', email: 'teacher@example.test', created_at: '2026-01-01T00:00:00Z' }
            : record }
        },
      }
    },
    rpc(name, parameters) {
      requests.push({ name, parameters })
      return { returns: async () => ({ data: response, error }) }
    },
  }
  return { service: api.createInstructorApi(client), requests, filters }
}

test('availability updates use the account-fenced RPC and preserve the exact opening snapshot', async () => {
  const f = fixture()
  assert.deepEqual(await f.service.saveAvailability(input), receipt)
  assert.deepEqual(f.requests, [{ name: 'save_instructor_availability', parameters: {
    request_id: requestId, expected_user: userId, target_slot: slotId, write_kind: 'update', expected_record: expected, new_value: value,
  } }])
  const projected = calendarView.toCalendarAvailability({ ...row, start_time: '12:00:30.123456' })
  assert.equal(projected.startTime, '12:00')
  assert.equal(projected.snapshot.startTime, '12:00:30.123456')
})

test('availability deletion accepts an old snapshot and sends no replacement value', async () => {
  const deleted = { requestId, slotId, kind: 'delete', slot: null }
  const f = fixture({ response: deleted })
  assert.deepEqual(await f.service.saveAvailability({ requestId, expectedUserId: userId, slotId,
    expected: { ...expected, date: '2000-01-01' }, kind: 'delete' }), deleted)
  assert.equal(f.requests[0].parameters.new_value, null)
})

test('availability writes reject account switches and invalid input before invoking the RPC', async () => {
  const switched = fixture({ account: uuid(99) })
  await assert.rejects(switched.service.saveAvailability(input), { code: 'forbidden' })
  assert.equal(switched.requests.length, 0)
  for (const change of [{ requestId: 'fixture' }, { slotId: 'fixture' }, { kind: 'invalid' },
    { value: { ...value, startTime: '07:00' } }, { value: { ...value, endTime: '11:00' } },
    { kind: 'delete', value }]) {
    const f = fixture()
    await assert.rejects(f.service.saveAvailability({ ...input, ...change }))
    assert.equal(f.requests.length, 0)
  }
})

test('availability receipts must match the request, action, slot and new values', async () => {
  for (const response of [null, { ...receipt, requestId: uuid(99) }, { ...receipt, slotId: uuid(99) },
    { ...receipt, kind: 'delete' }, { ...receipt, slot: null },
    { ...receipt, slot: { ...row, id: uuid(99) } }, { ...receipt, slot: { ...row, start_time: '14:00:00' } },
    { ...receipt, slot: { ...row, date: '2030-01-09' } }]) {
    await assert.rejects(fixture({ response }).service.saveAvailability(input), { code: 'invalid_data' })
  }
  assert.throws(() => decoders.decodeAvailabilitySave({ requestId, slotId, kind: 'delete', slot: row }), { code: 'invalid_data' })
})

test('availability reloads are filtered by both slot and linked instructor', async () => {
  const f = fixture()
  assert.deepEqual(await f.service.getAvailabilitySlot(slotId), row)
  assert.ok(f.filters.some(([table, column, value]) => table === 'instructor_availability' && column === 'id' && value === slotId))
  assert.ok(f.filters.some(([table, column, value]) => table === 'instructor_availability' && column === 'instructor_id' && value === instructorId))
  assert.equal(await fixture({ record: null }).service.getAvailabilitySlot(slotId), null)
  await assert.rejects(fixture({ record: { ...row, instructor_id: uuid(99) } }).service.getAvailabilitySlot(slotId), { code: 'invalid_data' })
})

test('availability stale-record and employment errors have safe recovery messages', async () => {
  const stale = errors.toInstructorDataError({ code: 'PAV05' }, 'Fallback')
  assert.equal(stale.code, 'conflict')
  assert.match(stale.message, /Reload.*draft is kept/)
  await assert.rejects(fixture({ error: { code: 'PAV06' } }).service.saveAvailability(input), { code: 'forbidden' })
})
