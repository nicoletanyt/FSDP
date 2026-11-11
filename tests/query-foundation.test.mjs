import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { createAppQueryClient, shouldRetryQuery } from '../src/lib/query-client.ts'
import { instructorQueryKeys, instructorQueryTimes } from '../src/lib/instructor/query-keys.ts'

const source = (await readFile(new URL('../src/lib/query-auth-boundary.ts', import.meta.url), 'utf8'))
  .replace("'./query-generation'", JSON.stringify(new URL('../src/lib/query-generation.ts', import.meta.url).href))
const { createQueryAuthBoundary } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

const clients = []
function testClient() {
  const client = createAppQueryClient()
  clients.push(client)
  return client
}
afterEach(() => { for (const client of clients.splice(0)) client.clear() })

function setup() {
  const client = testClient()
  const boundary = createQueryAuthBoundary(client)
  boundary.setUser('user-a')
  boundary.setRole('user-a', 'instructor')
  client.setQueryData(instructorQueryKeys.roster('user-a', 'event'), { sensitive: true })
  return { client, boundary }
}

test('logout clears cached data and cancels in-flight reads', async () => {
  const { client, boundary } = setup()
  let aborted = false
  let resolve
  const pending = client.fetchQuery({
    queryKey: ['in-flight'],
    gcTime: Infinity,
    queryFn: ({ signal }) => new Promise(done => {
      resolve = done
      signal.addEventListener('abort', () => { aborted = true })
    }),
  }).catch(() => undefined)
  boundary.setUser(null)
  assert.equal(aborted, true)
  assert.equal(client.getQueryCache().getAll().length, 0)
  resolve('late result')
  await pending
  assert.equal(client.getQueryData(['in-flight']), undefined)
})

test('user switch clears data and ignores a late profile from the old user', () => {
  const { client, boundary } = setup()
  boundary.setUser('user-b')
  assert.equal(client.getQueryCache().getAll().length, 0)
  boundary.setRole('user-b', 'instructor')
  client.setQueryData(instructorQueryKeys.roster('user-b', 'event'), 'new account')
  boundary.setRole('user-a', 'student')
  assert.equal(client.getQueryData(instructorQueryKeys.roster('user-b', 'event')), 'new account')
})

test('role loss or unavailable profile clears data; same user and role do not', () => {
  for (const nextRole of ['student', 'administrator', null]) {
    const { client, boundary } = setup()
    boundary.setUser('user-a')
    boundary.setRole('user-a', 'instructor')
    assert.ok(client.getQueryData(instructorQueryKeys.roster('user-a', 'event')))
    boundary.setRole('user-a', nextRole)
    assert.equal(client.getQueryCache().getAll().length, 0)
  }
})

test('focus refetch is enabled and authentication or permission failures are never retried', () => {
  const options = testClient().getDefaultOptions()
  assert.equal(options.queries.refetchOnWindowFocus, true)
  assert.equal(options.mutations.retry, false)
  for (const error of [
    { status: 401 }, { status: 403 }, { status: '403' }, { code: '42501' },
    { code: 'PGRST301' }, { code: 'PGRST302' }, { code: 'PGRST303' },
    { code: 'forbidden' }, { code: 'unauthenticated' }, { name: 'AuthSessionMissingError' },
  ]) assert.equal(shouldRetryQuery(0, error), false)
  assert.equal(shouldRetryQuery(0, new Error('network')), true)
  assert.equal(shouldRetryQuery(1, new Error('network')), false)
})

test('query keys isolate users and preserve resource parameters; freshness matches the plan', () => {
  assert.notDeepEqual(instructorQueryKeys.roster('user-a', 'event'), instructorQueryKeys.roster('user-b', 'event'))
  assert.notDeepEqual(instructorQueryKeys.event('user-a', 'a'), instructorQueryKeys.event('user-a', 'b'))
  assert.notDeepEqual(instructorQueryKeys.studentHistory('user-a', 's', { page: 1 }), instructorQueryKeys.studentHistory('user-a', 's', { page: 2 }))
  assert.deepEqual(instructorQueryTimes.roster, { staleTime: 30_000, gcTime: 600_000 })
  assert.deepEqual(instructorQueryTimes.reference, { staleTime: 600_000, gcTime: 1_800_000 })
})
