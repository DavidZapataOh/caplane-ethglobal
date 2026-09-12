import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCaplaneClient } from './client.js'
import { DEPLOYED_AT, MAX_SPAN, liensOf, withRetry } from './history.js'

const BORROWER = '0x86Ec9f04485Db066CF155353f15eef356Ae90253' as const
const client = createCaplaneClient()

// The contract has no enumeration view, so the event is the only listing primitive there is, and
// `borrower` being indexed is what makes the question answerable at all.
test("a borrower's liens are enumerable by anyone", async () => {
  const liens = await liensOf(client, BORROWER)
  assert.ok(liens.length >= 1)
  assert.equal(liens[0]?.borrower.toLowerCase(), BORROWER.toLowerCase())
  assert.equal(typeof liens[0]?.expiresAt, 'bigint')
  assert.equal(typeof liens[0]?.blockNumber, 'bigint')
})

// Measured: a span over 10,000 blocks answers `-32614 eth_getLogs is limited to a 10,000 range`,
// and viem does not split one for you. A span wider than the cap has to come back anyway.
test('the scan paginates instead of asking for the whole chain', async () => {
  assert.equal(MAX_SPAN, 10_000n)
  const liens = await liensOf(client, BORROWER, { fromBlock: 61_600_000n })
  assert.ok(liens.length >= 1, 'a span wider than the endpoint cap still returns')
})

// The default has to reach the deployment block, not a window off the head. At 0.516 s a block a
// 10,000-block window is 86 minutes, so a head-relative default returns an empty list for every
// lien older than that — and an empty list is what a lender reads as "nothing pledged".
test('the default scan reaches back to the deployment block', async () => {
  assert.equal(DEPLOYED_AT, 61_681_981n)
  const defaulted = await liensOf(client, BORROWER)
  const explicit = await liensOf(client, BORROWER, { fromBlock: DEPLOYED_AT })
  assert.deepEqual(defaulted.map((lien) => lien.lienId), explicit.map((lien) => lien.lienId))
  assert.ok(defaulted.length >= 1)
})

// A borrower with nothing is an empty list, not a failure. A lender checking an unknown
// counterparty gets an answer instead of an exception.
test('a borrower with no liens returns empty', async () => {
  assert.deepEqual(await liensOf(client, '0x000000000000000000000000000000000000dEaD'), [])
})

// Measured: the endpoint rejected an identical, legal 8,792-block query twelve times running over
// twenty seconds and then answered six for six. It is load shedding, not a verdict about the range,
// so a single rejection must not throw away the pages already collected.
test('a transient rejection is retried rather than losing the scan', async () => {
  let attempts = 0
  const flaky = async () => {
    attempts += 1
    if (attempts < 3) throw new Error('requested range too large')
    return 'answered'
  }
  assert.equal(await withRetry(flaky, 0), 'answered')
  assert.equal(attempts, 3)
})

// And a failure that never clears still has to surface, rather than reading as an empty range.
test('a rejection that never clears is raised, not swallowed', async () => {
  await assert.rejects(
    () => withRetry(async () => { throw new Error('endpoint down') }, 0),
    /endpoint down/,
  )
})

// The scan deliberately does NOT go through the quorum, and the reason is measured: the two
// default endpoints do not share a log-range limit — the second refuses a two-thousand-block query
// while reporting a ten-thousand-block cap, and accepts a hundred. A quorum scan would need about
// seven hundred requests per endpoint. So a client whose second endpoint is a different chain
// entirely still enumerates, which is the observable proof that only the first is asked — and the
// exposure it leaves is written in the README rather than hidden.
test('the scan asks one endpoint, and that is declared', async () => {
  const split = createCaplaneClient({
    rpcUrls: ['https://rpc.testnet.arc.io', 'https://ethereum-rpc.publicnode.com'],
  })
  const liens = await liensOf(split, BORROWER)
  assert.ok(liens.length >= 1)
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')
  assert.match(readme, /one endpoint/i)
})
