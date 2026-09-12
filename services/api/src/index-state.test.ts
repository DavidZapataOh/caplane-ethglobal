import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ADDRESSES, DEPLOYED_AT, MAX_EVENTS, createIndex } from './index-state.js'
import { blockNumber } from './rpc.js'
import type { Log } from './rpc.js'

const anEvent = (block: number) => ({
  name: 'LienRecorded',
  address: ADDRESSES[0]!,
  blockNumber: String(block),
  logIndex: 0,
  transactionHash: '0x00' as const,
  fields: {},
})

test('the backfill starts where the registry was deployed', () => {
  assert.equal(DEPLOYED_AT, 61_681_981n)
  assert.ok(MAX_EVENTS > 0)
  assert.equal(ADDRESSES.length, 4)
})

// The whole point of the service. An implementation that returned [] forever would answer the same
// 200, so the assertion is equality against a derivation done independently in the same run.
test('the index equals a fresh derivation of the same span', async () => {
  const index = createIndex()
  await index.backfill()
  const served = index.snapshot()
  assert.ok(served.events.length > 0, 'the chain has logs and the index found none')

  const again = createIndex()
  await again.backfill(served.indexedThrough)
  assert.deepEqual(
    again.snapshot().events.map((event) => `${event.blockNumber}:${event.logIndex}`),
    served.events.map((event) => `${event.blockNumber}:${event.logIndex}`),
  )
})

// A rejected range is not an empty range. If the cursor moves on failure the gap is never revisited
// and the feed is quietly short for the rest of the process's life, while the service answers 200.
test('an unclassified failure is raised and moves nothing', async () => {
  const index = createIndex({
    fetchPage: async () => {
      throw new Error('endpoint down')
    },
  })
  const before = index.snapshot().indexedThrough
  await assert.rejects(() => index.backfill())
  assert.equal(index.snapshot().indexedThrough, before)
})

// And the case that matters more, because it is the one the endpoint actually produces: a rejection
// the classifier recognises, which never clears. Retrying is right; advancing past it is the silent
// failure of the whole service. The unclassified test above cannot catch that — its error has no
// code, so it is raised before the cursor is ever touched.
test('a classified rejection that never clears advances nothing', async () => {
  let calls = 0
  const index = createIndex({
    pauseMs: 0,
    retryDelayMs: 0,
    fetchPage: async (): Promise<Log[]> => {
      calls += 1
      throw Object.assign(new Error('rate limit exceeded'), { code: -32005 })
    },
  })
  const before = index.snapshot().indexedThrough
  await assert.rejects(() => index.backfill(DEPLOYED_AT + 10n))
  assert.equal(index.snapshot().indexedThrough, before)
  assert.ok(calls > 1, 'it has to have retried rather than given up on the first refusal')
})

// A feed that froze looks exactly like a quiet feed. It has to say which one it is.
test('an index that stopped advancing says so', async () => {
  const index = createIndex({ staleAfterMs: 0 })
  await index.backfill()
  assert.equal(index.snapshot().stale, true)
  const fresh = createIndex({ staleAfterMs: 600_000 })
  await fresh.backfill()
  assert.equal(fresh.snapshot().stale, false)
})

test('the lag is reported in blocks, against the real head', async () => {
  const index = createIndex()
  await index.backfill()
  const snapshot = index.snapshot()
  assert.equal(snapshot.lagBlocks, Number(snapshot.head - snapshot.indexedThrough))
  assert.ok(snapshot.head >= (await blockNumber()) - 64n)
})

// Memory is the only budget an in-memory index has, and an unbounded list is how a worker dies
// three days into an asynchronous evaluation.
test('the feed is bounded and admits it', () => {
  const index = createIndex({ maxEvents: 2 })
  assert.equal(index.snapshot().truncated, false)
  index.absorb([1, 2, 3, 4, 5].map((block) => anEvent(block)))
  assert.equal(index.snapshot().events.length, 2)
  assert.equal(index.snapshot().truncated, true)
})

// Newest first, so a dashboard reads the top of the list and stops.
test('the feed is ordered newest first', async () => {
  const index = createIndex()
  await index.backfill()
  const blocks = index.snapshot().events.map((event) => BigInt(event.blockNumber))
  for (let at = 1; at < blocks.length; at += 1) assert.ok(blocks[at - 1]! >= blocks[at]!)
})

// The five failure kinds exist so they can be acted on differently. A page that comes back on the
// second try must not be lost, and the seam is a real function that fails for real.
test('a page that fails once and then answers is not lost', async () => {
  let calls = 0
  const index = createIndex({
    pauseMs: 0,
    retryDelayMs: 0,
    fetchPage: async (): Promise<Log[]> => {
      calls += 1
      if (calls === 1) throw Object.assign(new Error('requested range too large'), { code: -32012 })
      return []
    },
  })
  await index.backfill(DEPLOYED_AT + 10n)
  assert.ok(calls >= 2)
  assert.equal(index.snapshot().indexedThrough, DEPLOYED_AT + 10n)
})
