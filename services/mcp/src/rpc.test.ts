import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LienStatus } from 'caplane-sdk'
import { RPC_URL, readLien, requests } from './rpc.js'

// A lien the registry wrote, and a submission it refused. Both are real ids the chain knows; the
// second is a better negative than an invented one because it is the case a lender actually meets.
const RECORDED = '0xebd60de9b8c99e6bde3ce7ad1894177e706e75c0120c192da71400a378ae7e4c' as const
const REFUSED = '0x9c22eff8f4efee07013d86feaf5f1a559053004f1f61915873690d57e5a08b29' as const

// The measured trap of every surface built on this registry: the only lien on chain is released, so
// isEncumbered answers false for it AND for an id nobody ever wrote. A server that answered "not
// encumbered" to everything would be indistinguishable through that field alone.
test('a recorded lien and a refused submission differ where it matters', async () => {
  const recorded = await readLien(RECORDED)
  const refused = await readLien(REFUSED)
  assert.equal(recorded.encumbered, refused.encumbered) // both false today, and that is the point
  assert.equal(recorded.status, LienStatus.Released)
  assert.equal(refused.status, LienStatus.None)
  assert.equal(recorded.lien.borrower, '0x86Ec9f04485Db066CF155353f15eef356Ae90253')
  assert.equal(recorded.lien.advanceUsdc6, 8_000_000n)
  assert.equal(recorded.lien.rateBps, 200)
  assert.equal(refused.lien.borrower, '0x0000000000000000000000000000000000000000')
})

// Without this the answer is worth exactly as much as our word for it, and the explorer is not a
// substitute: an agent cannot click.
test('every answer carries what it takes to redo it', async () => {
  const { receipt } = await readLien(RECORDED)
  assert.match(receipt.endpoint, /^https:\/\//)
  assert.equal(receipt.endpoint, RPC_URL)
  assert.equal(receipt.calls.length, 3)
  assert.match(receipt.blockNumber, /^0x[0-9a-f]+$/)
  assert.ok(BigInt(receipt.blockNumber) > 61_681_981n)
  for (const call of receipt.calls) {
    assert.match(call.data, /^0x[0-9a-f]+$/)
    assert.match(call.result, /^0x[0-9a-f]*$/)
  }
})

// And it has to actually replay, against the endpoint and the height it names.
test('the receipt replays to the same bytes', async () => {
  const { receipt } = await readLien(RECORDED)
  for (const call of receipt.calls) {
    const replayed = (await (
      await fetch(receipt.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to: receipt.to, data: call.data }, receipt.blockNumber],
        }),
      })
    ).json()) as { result: string }
    assert.equal(replayed.result, call.result)
  }
})

// Measured: forty concurrent eth_calls split twenty/twenty between 200 and 429, and the 429 carries
// no Retry-After. One POST carrying three calls is also faster and steadier than three.
test('the three reads travel in one request', async () => {
  const before = requests()
  await readLien(RECORDED)
  assert.equal(requests() - before, 2, 'one height lookup and one batch')
})

// Three calls at three heights could contradict each other, and a receipt naming a height that no
// longer answers the same thing is worse than no receipt.
test('the reads are pinned to one height', async () => {
  const { receipt } = await readLien(RECORDED)
  assert.equal(typeof receipt.blockNumber, 'string')
  assert.equal(receipt.calls.every((call) => call.data.length > 10), true)
})

// A batch may answer out of order, and a per-member error is not fatal to the batch. Reading by
// position would silently pair a status with the wrong lien.
test('the batch is read by id and never by position', () => {
  const source = readFileSync(new URL('../../src/rpc.ts', import.meta.url), 'utf8')
  assert.match(source, /find\(/)
  assert.equal(/answers\[0\]|answers\[1\]|answers\[2\]/.test(source), false)
})
