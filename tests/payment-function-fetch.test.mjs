import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/payment-function-fetch.ts', import.meta.url), 'utf8')
const { paymentFunctionFetch } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('local grading checkout preserves authorization and the body, without rerouting other Supabase requests', async () => {
  const calls = []
  const fetcher = async (input, init) => { calls.push(new Request(input, init)); return Response.json({}) }
  const request = paymentFunctionFetch('https://example.supabase.co', 'http://127.0.0.1:8787', fetcher)
  await request('https://example.supabase.co/functions/v1/create-grading-checkout', {
    method: 'POST', headers: { authorization: 'Bearer user-jwt', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'checkout' }),
  })
  assert.equal(calls[0].url, 'http://127.0.0.1:8787/functions/v1/create-grading-checkout')
  assert.equal(calls[0].headers.get('authorization'), 'Bearer user-jwt')
  assert.deepEqual(await calls[0].json(), { action: 'checkout' })
  for (const path of ['/auth/v1/user', '/rest/v1/students', '/functions/v1/create-credit-checkout']) {
    await request(`https://example.supabase.co${path}`)
    assert.equal(calls.at(-1).url, `https://example.supabase.co${path}`)
  }
  await request('https://other.example/functions/v1/create-grading-checkout')
  assert.equal(calls.at(-1).url, 'https://other.example/functions/v1/create-grading-checkout')
})

test('local payment routing cannot forward authorization to a remote endpoint', () => {
  assert.throws(() => paymentFunctionFetch('https://example.supabase.co', 'https://other.example'), /localhost/)
})
