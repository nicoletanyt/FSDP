import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/student-credit-batches.ts', import.meta.url), 'utf8')
const { loadStudentCreditBatches, creditBatchStatus } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)
const signal = new AbortController().signal
const row = { id: 'one', credits_total: 10, credits_remaining: 4, unlimited: false,
  expires_at: '2026-12-01T12:00:00Z', created_at: '2026-11-01T12:00:00Z', source: 'purchase',
  credit_purchases: { pass_title: '10 Session Pass' } }

function clientFor(rows = [row], error = null) {
  const calls = []
  return { calls, from(table) {
    const call = { table, filters: [], orders: [] }; calls.push(call)
    const query = {
      select() { return query }, eq(column,value) { call.filters.push([column,value]); return query },
      gt(column,value) { call.filters.push(['gt',column,value]); return query },
      order(column) { call.orders.push(column); return query },
      range(start,end) { call.range = [start,end]; return query },
      async abortSignal(value) { assert.equal(value,signal); return { data: rows.slice(call.range[0],call.range[1]+1), error } },
    }
    return query
  } }
}

test('pass list reads database names, balances and exact expiry with explicit ownership', async () => {
  const client = clientFor()
  const [batch] = await loadStudentCreditBatches(client,'user-one',signal)
  assert.equal(batch.title,'10 Session Pass')
  assert.equal(batch.remaining,4)
  assert.equal(batch.expiresAt,row.expires_at)
  assert.deepEqual(client.calls[0].filters,[['user_id','user-one'],['gt','credits_remaining',0]])
  assert.deepEqual(client.calls[0].orders,['expires_at','created_at','id'])
})

test('legacy infinity is explicit missing expiry, not an invented date', async () => {
  const [batch] = await loadStudentCreditBatches(clientFor([{...row,source:'legacy',expires_at:'infinity'}]),'user',signal)
  assert.equal(batch.title,'Legacy credits')
  assert.equal(batch.expiresAt,null)
  assert.equal(batch.legacy,true)
  assert.equal(creditBatchStatus(batch),'active')
  const [nullable] = await loadStudentCreditBatches(clientFor([{...row,source:'legacy',expires_at:null}]),'user',signal)
  assert.equal(nullable.expiresAt,null)
})

test('zero-credit batches are not rendered, including unlimited entitlements without point credits', async () => {
  const batches = await loadStudentCreditBatches(clientFor([
    row, {...row,id:'used',credits_remaining:0},
    {...row,id:'unlimited',unlimited:true,credits_total:0,credits_remaining:0},
  ]),'user',signal)
  assert.deepEqual(batches.map(batch=>batch.id),['one'])
})

test('status boundaries distinguish expired, used, soon, long validity and unlimited', async () => {
  const [batch] = await loadStudentCreditBatches(clientFor(),'user',signal)
  const expiry = Date.parse(batch.expiresAt)
  assert.equal(creditBatchStatus(batch,expiry),'expired')
  assert.equal(creditBatchStatus(batch,expiry - 21*86_400_000),'expiring')
  assert.equal(creditBatchStatus(batch,expiry - 21*86_400_000 - 1),'active')
  assert.equal(creditBatchStatus({...batch,remaining:0},expiry-1),'used')
  assert.equal(creditBatchStatus({...batch,unlimited:true,remaining:0,total:0},expiry-1),'expiring')
})

test('all pages are read and unavailable or malformed data never becomes a fake pass', async () => {
  const client = clientFor(Array.from({length:201},(_,i)=>({...row,id:String(i)})))
  assert.equal((await loadStudentCreditBatches(client,'user',signal)).length,201)
  assert.equal(client.calls.length,2)
  assert.deepEqual(await loadStudentCreditBatches(clientFor([]),'user',signal),[])
  await assert.rejects(loadStudentCreditBatches(clientFor([],new Error('offline')),'user',signal),/offline/)
  for (const bad of [{...row,expires_at:'bad'}, {...row,credits_remaining:11}, {...row,credits_remaining:-1}]) {
    await assert.rejects(loadStudentCreditBatches(clientFor([bad]),'user',signal),/Invalid credit batch/)
  }
})
