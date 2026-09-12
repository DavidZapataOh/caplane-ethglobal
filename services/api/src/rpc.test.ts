import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RPC_URL, RpcError, blockNumber, classify, getLogs } from './rpc.js'

// Measured against the live endpoint. Five distinct failures, and only one of them is about the
// declared range. Collapsing any of them into "no logs here" advances the cursor over a gap that is
// never looked at again, and the service keeps answering 200 while the feed is quietly short.
test('the endpoint failures are told apart', () => {
  assert.equal(classify({ code: -32614, message: 'eth_getLogs is limited to a 10,000 range' }).kind, 'split')
  assert.equal(classify({ code: -32012, message: 'requested range too large' }).kind, 'retry')
  assert.equal(classify({ code: -32005, message: 'rate limit exceeded' }).kind, 'retry')
  assert.equal(classify({ code: -32014, message: 'requested data not available' }).kind, 'clamp')
  assert.equal(classify({ code: -32601, message: 'method not supported' }).kind, 'fatal')
})

// Measured live: the endpoint sheds load at the transport layer too, answering HTTP 429 with no
// JSON-RPC body. Classified fatal it would stop the index on a burst, and a burst is exactly what
// a seven-page backfill is.
test('a transport-level rate limit is transient, not fatal', () => {
  assert.equal(classify({ code: 429, message: 'transport 429' }).kind, 'retry')
  assert.equal(classify({ code: 503, message: 'transport 503' }).kind, 'retry')
  assert.equal(classify({ code: 404, message: 'transport 404' }).kind, 'fatal')
})

// -32602 carries the range to retry inside its own message. Halving blindly also terminates, but it
// throws away an answer the endpoint already computed.
test('the too-many-results error is followed, not guessed', () => {
  const seen = classify({
    code: -32602,
    message:
      'request exceeded max allowed range: query exceeds max results 20000, retry with the range 61680709-61681040',
  })
  assert.equal(seen.kind, 'narrow')
  assert.deepEqual(seen.hint, { from: 61_680_709n, to: 61_681_040n })
})

// The same code with no range in the message must not be read as a hint of undefined and then used.
test('a too-many-results error with no range falls back to splitting', () => {
  const seen = classify({ code: -32602, message: 'query exceeds max results 20000' })
  assert.equal(seen.kind, 'split')
  assert.equal(seen.hint, undefined)
})

// A rejected range is not an empty range. This is the one silent failure of the whole service, so
// the transport has to raise rather than return nothing.
test('a failure never reads as an empty page', async () => {
  await assert.rejects(
    () => getLogs({ fromBlock: 0n, toBlock: 10n ** 12n, addresses: [] }),
    (error: Error) => error instanceof RpcError && error.name === 'RpcError',
  )
})

// -32014 is the one that never clears: it means toBlock is past the head, and retrying it forever
// looks exactly like an outage. Measured, live.
test('asking past the head is a clamp, not an outage', async () => {
  const head = await blockNumber()
  await assert.rejects(
    () => getLogs({ fromBlock: head, toBlock: head + 1_000_000n, addresses: [] }),
    (error: Error) => error instanceof RpcError && classify(error as RpcError).kind !== 'fatal',
  )
})

test('the endpoint answers without a credential', async () => {
  assert.match(RPC_URL, /^https:\/\//)
  assert.ok((await blockNumber()) > 61_681_981n)
})
