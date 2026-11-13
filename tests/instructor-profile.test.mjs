import assert from 'node:assert/strict'
import test from 'node:test'
import { profile } from './helpers/instructor-modules.mjs'

const { createInstructorProfileApi } = profile
const userId = '00000000-0000-4000-8000-000000000001'
const instructorId = '00000000-0000-4000-8000-000000000002'
const otherUser = '00000000-0000-4000-8000-000000000003'
const oldPath = `${userId}/00000000-0000-4000-8000-000000000004.jpg`
const identity = { userId, instructorId, name: 'Test Instructor', email: 'test@example.test' }

function fixture(options = {}) {
  const calls = []
  const client = {
    from(table) {
      const query = {
        select(columns) { calls.push(['select', table, columns]); return this },
        eq(column, value) { calls.push(['eq', table, column, value]); return this },
        abortSignal() { return this },
        async single() { return { data: options.row ?? { profile_picture_url: oldPath, employment_type: 'part_time', instructor_title: 'none', is_examiner: false }, error: options.readError } },
        async maybeSingle() { return { data: options.noAddress ? null : { address: 'Saved address' }, error: options.readError } },
      }
      return query
    },
    async rpc(name, parameters) {
      calls.push(['rpc', name, parameters])
      if (options.rpcReject) throw new Error('Lost response')
      return { data: options.badResponse ? {} : name === 'save_instructor_address'
        ? { address: parameters.new_address } : { photo_path: parameters.new_photo_path }, error: options.rpcError }
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'instructor-photos')
        return {
          async upload(path, image, settings) { calls.push(['upload', path, image, settings]); return { error: options.uploadError } },
          async createSignedUrl(path, expiresIn) {
            calls.push(['sign', path, expiresIn])
            return { data: { signedUrl: `https://storage.example.test/signed/${path}` }, error: options.signError }
          },
          async remove(paths) { calls.push(['remove', paths]); if (options.cleanupError) throw new Error('Cleanup failed'); return { error: null } },
        }
      },
    },
  }
  const api = createInstructorProfileApi(client, async () => { calls.push(['identity']); return identity })
  return { api, calls }
}

test('profile loads real private address, employment type and a temporary URL for the saved storage path', async () => {
  const { api, calls } = fixture()
  assert.deepEqual(await api.getProfile(userId), { instructorId, userId, address: 'Saved address',
    employmentType: 'part_time', photoPath: oldPath, photoUrl: `https://storage.example.test/signed/${oldPath}`, grade: null, instructorTitle: 'none', isExaminer: false })
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'instructor_private_details' && call[3] === instructorId))
  assert.deepEqual(calls.find(call => call[0] === 'sign'), ['sign', oldPath, 3600])
})

test('missing optional profile fields remain empty, not placeholder records', async () => {
  const { api, calls } = fixture({ row: { profile_picture_url: null, employment_type: null, instructor_title: 'none', is_examiner: false }, noAddress: true })
  const result = await api.getProfile(userId)
  assert.equal(result.address, null)
  assert.equal(result.photoUrl, null)
  assert.equal(result.employmentType, null)
  assert.equal(result.grade, null)
  assert.equal(result.instructorTitle, 'none')
  assert.ok(!calls.some(call => call[0] === 'sign'))
})

test('profile returns the instructor grade and belt colour', async () => {
  const grade = { id: 'black', label: 'Black belt', colour: 'black', is_ranked: true, sort_order: 10 }
  const { api } = fixture({ row: { profile_picture_url: null, employment_type: null, instructor_title: 'none', is_examiner: false, grade } })
  assert.deepEqual((await api.getProfile(userId)).grade, grade)
})

test('profile selects and returns the Aikikai title independently of grade', async () => {
  const grade = { id: 'black', label: '1st Dan', colour: 'black', is_ranked: true, sort_order: 10 }
  for (const instructor_title of ['none', 'shihan', 'shidoin', 'fukushidoin']) {
    const { api, calls } = fixture({ row: { profile_picture_url: null, employment_type: null, instructor_title, is_examiner: true, grade } })
    const result = await api.getProfile(userId)
    assert.equal(result.instructorTitle, instructor_title)
    assert.equal(result.isExaminer, true)
    assert.deepEqual(result.grade, grade)
    assert.match(calls.find(call => call[0] === 'select' && call[1] === 'instructors')[2], /\binstructor_title\b/)
  }
})

test('missing or unknown instructor titles are rejected as invalid profile data', async () => {
  for (const instructor_title of [null, undefined, 'dojo-cho', 'Shihan', 'None', '', 1]) {
    const { api } = fixture({ row: { profile_picture_url: null, employment_type: null, instructor_title, is_examiner: false } })
    await assert.rejects(() => api.getProfile(userId), error => error.code === 'invalid_data')
  }
})

test('address saves trim input, clear empty input, reject overlong drafts and require authoritative confirmation', async () => {
  const { api, calls } = fixture()
  assert.equal(await api.saveAddress(userId, '  Street\nSingapore 123456  '), 'Street\nSingapore 123456')
  assert.equal(await api.saveAddress(userId, '  '), null)
  assert.deepEqual(calls.filter(call => call[0] === 'rpc').map(call => call[2]), [
    { expected_user: userId, new_address: 'Street\nSingapore 123456' },
    { expected_user: userId, new_address: null },
  ])
  const before = calls.length
  await assert.rejects(api.saveAddress(userId, 'x'.repeat(1001)), { code: 'invalid_request' })
  assert.equal(calls.length, before)
  await assert.rejects(fixture({ badResponse: true }).api.saveAddress(userId, 'Street'), { code: 'request_failed' })
})

test('profile reads and mutations fence account changes before any data or storage request', async () => {
  const { api, calls } = fixture()
  const photo = new Blob(['jpeg'], { type: 'image/jpeg' })
  for (const operation of [() => api.getProfile(otherUser), () => api.saveAddress(otherUser, 'Street'),
    () => api.uploadProfilePhoto(otherUser, null, photo), () => api.removeProfilePhoto(otherUser, oldPath)]) {
    await assert.rejects(operation(), { code: 'forbidden' })
  }
  assert.ok(calls.every(call => call[0] === 'identity'))
})

test('photo uploads create an immutable owned file, store only its path, then clean up the old image', async () => {
  const { api, calls } = fixture()
  const image = new Blob(['jpeg'], { type: 'image/jpeg' })
  const result = await api.uploadProfilePhoto(userId, oldPath, image)
  assert.match(result.photoPath, new RegExp(`^${userId}/[0-9a-f-]{36}\\.jpg$`))
  assert.ok(result.photoUrl.startsWith('https://'))
  const upload = calls.find(call => call[0] === 'upload')
  assert.equal(upload[2], image)
  assert.deepEqual(upload[3], { contentType: 'image/jpeg', upsert: false })
  const saved = calls.find(call => call[0] === 'rpc')
  assert.equal(saved[1], 'save_instructor_profile_photo')
  assert.deepEqual(saved[2], { expected_user: userId, expected_photo_path: oldPath, new_photo_path: result.photoPath })
  assert.ok(!saved[2].new_photo_path.includes('https://'))
  assert.deepEqual(calls.at(-1), ['remove', [oldPath]])
})

test('photo upload/sign/save failures never delete the existing or possibly committed new image', async () => {
  const image = new Blob(['jpeg'], { type: 'image/jpeg' })
  for (const options of [{ uploadError: new Error('Upload failed') }, { signError: new Error('Signing failed') },
    { rpcError: { code: 'PPR01' } }, { rpcReject: true }, { badResponse: true }]) {
    const { api, calls } = fixture(options)
    await assert.rejects(api.uploadProfilePhoto(userId, oldPath, image))
    assert.ok(!calls.some(call => call[0] === 'remove'))
  }
  const { api } = fixture({ cleanupError: true })
  assert.ok((await api.uploadProfilePhoto(userId, oldPath, image)).photoPath)
})

test('removal clears the database pointer before deleting the object and rejects stale photo snapshots', async () => {
  const { api, calls } = fixture()
  assert.deepEqual(await api.removeProfilePhoto(userId, oldPath), { photoPath: null, photoUrl: null })
  assert.deepEqual(calls.map(call => call[0]), ['identity', 'rpc', 'remove'])
  await assert.rejects(fixture({ rpcError: { code: 'PPR01' } }).api.removeProfilePhoto(userId, oldPath), { code: 'conflict' })
})

test('invalid prepared images are rejected before accessing the backend', async () => {
  const { api, calls } = fixture()
  for (const image of [new Blob(['bad'], { type: 'image/svg+xml' }), new Blob([], { type: 'image/jpeg' }),
    new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' })]) {
    await assert.rejects(api.uploadProfilePhoto(userId, oldPath, image), { code: 'invalid_request' })
  }
  assert.equal(calls.length, 0)
})

test('the examiner flag must be a boolean', async () => {
  for (const is_examiner of [null, undefined, 'true', 1]) {
    const { api } = fixture({ row: { profile_picture_url: null, employment_type: null, instructor_title: 'none', is_examiner } })
    await assert.rejects(() => api.getProfile(userId), error => error.code === 'invalid_data')
  }
})
