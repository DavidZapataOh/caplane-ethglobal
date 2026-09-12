import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toEventSelector } from 'viem'
import { DEPLOYED_AT, TOPICS, explain, liensOf } from './history.ts'

const RECORDED = '0xebd60de9b8c99e6bde3ce7ad1894177e706e75c0120c192da71400a378ae7e4c'
const REFUSED = '0x9c22eff8f4efee07013d86feaf5f1a559053004f1f61915873690d57e5a08b29'
const BORROWER = '0x86ec9f04485db066cf155353f15eef356ae90253'

// Hand-written for the same reason the selectors are, and pinned the same way: a transcribed topic
// silently matches nothing, so the filter comes back empty and the page says there is no record.
test('the hand-written topics are the real ones', () => {
  assert.equal(TOPICS.LienRecorded, toEventSelector('LienRecorded(bytes32,address,uint64)'))
  assert.equal(TOPICS.LienReleased, toEventSelector('LienReleased(bytes32)'))
  assert.equal(TOPICS.SubmissionRejected, toEventSelector('SubmissionRejected(bytes32,uint8)'))
})

test('the scan starts where the registry was deployed', () => {
  assert.equal(DEPLOYED_AT, 61_681_981n)
})

// This is the only question a visitor can ask without having been handed anything, and it is why
// the page is more than a receipt viewer: it answers how much a counterparty has already pledged.
test('a borrower enumerates to what was recorded for them', async () => {
  const found = await liensOf(BORROWER)
  assert.equal(found.length, 1)
  assert.equal(found[0]?.lienId, RECORDED)
  assert.equal(typeof found[0]?.blockNumber, 'bigint')
})

// An address with nothing is an empty list, not a failure. A lender checking an unknown
// counterparty gets an answer.
test('a borrower with nothing returns empty', async () => {
  assert.deepEqual(await liensOf('0x000000000000000000000000000000000000dead'), [])
})

// A rejected range is not an empty range. The endpoint answers -32012 under load and 4444 for a
// pruned span, and an empty list is what a lender reads as "nothing pledged".
test('a failure propagates instead of reading as nothing pledged', async () => {
  await assert.rejects(() =>
    liensOf(BORROWER, async () => {
      throw new Error('the endpoint answered 429')
    }),
  )
})

// Measured: lienOf returns seven zero words both for an id the registry refused and for one it
// never saw. The contract cannot tell them apart; only the logs can. Calling a refused submission
// "not found" would hide the most interesting thing the registry has to say.
test('a refused submission is explained, not called unknown', async () => {
  assert.equal(await explain(REFUSED), 'rejected:1')
  assert.equal(await explain(`0x${'11'.repeat(32)}`), 'unknown')
  assert.equal(await explain(RECORDED), 'released')
})

// The log read is the fragile half. When it fails the page says there is no record — which is true
// — instead of inventing a reason or showing an error for a question the call already answered.
test('a failed log read degrades to undefined, never to a wrong reason', async () => {
  assert.equal(
    await explain(REFUSED, async () => {
      throw new Error('endpoint down')
    }),
    undefined,
  )
})
