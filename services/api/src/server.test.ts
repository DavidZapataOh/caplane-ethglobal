import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createIndex } from './index-state.js'
import { createApi } from './server.js'

// Closed from `after`, not from the end of the test body: an assertion that fails skips the rest of
// the body, the listener leaks, and `node --test` waits forever for the event loop to drain — a
// suite that hangs on failure rather than reporting it.
const listen = (t: { after: (fn: () => void) => void }) =>
  new Promise<{ url: string }>((resolve) => {
    const server = createApi(createIndex())
    t.after(() => server.close())
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({ url: `http://127.0.0.1:${port}` })
    })
  })

// The deployed contract, pinned by evidence: /health is 200 "ok" and everything else is a 404
// carrying "not found". A 200 on /health alone would also come from a platform placeholder page;
// the 404 is what proves this responder is the one in this repository.
test('the health contract survives the new route', async (t) => {
  const api = await listen(t)
  const ok = await fetch(`${api.url}/health`)
  assert.equal(ok.status, 200)
  assert.equal(await ok.text(), 'ok')
  const missing = await fetch(`${api.url}/nothing`)
  assert.equal(missing.status, 404)
  assert.equal(await missing.text(), 'not found')
})

// The threat model closes "registrar equivocation" on the ground that no view is served by an
// operator. A route answering whether a right is taken reopens it, in the file a judge reads to
// check that model. This is the structural claim of the service.
test('no route answers for the state of a right', async (t) => {
  const api = await listen(t)
  for (const path of ['/liens/0x00', '/liens/0x00/encumbered', '/encumbered/0x00', '/status/0x00']) {
    assert.equal((await fetch(`${api.url}${path}`)).status, 404, path)
  }
})

// Measured against the live deployment: there is not one access-control header today, so a browser
// on another origin cannot read this at all.
test('a browser on another origin may read the feed', async (t) => {
  const api = await listen(t)
  const response = await fetch(`${api.url}/activity`, { headers: { origin: 'https://example.test' } })
  assert.equal(response.headers.get('access-control-allow-origin'), '*')
  const preflight = await fetch(`${api.url}/activity`, { method: 'OPTIONS' })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS')
})

// Convenience layer, never a source of truth — and it has to say so in the payload, not only in a
// README nobody fetches. Everything needed to redo the answer from chain travels with it.
test('the payload carries what it takes to re-derive it', async (t) => {
  const api = await listen(t)
  const body = (await (await fetch(`${api.url}/activity`)).json()) as Record<string, unknown>
  assert.equal(body.source, 'chain')
  assert.equal(body.chainId, 5042002)
  assert.equal((body.addresses as string[]).length, 4)
  assert.equal(typeof body.indexedThrough, 'string')
  assert.equal(typeof body.head, 'string')
  assert.equal(typeof body.lagBlocks, 'number')
  assert.equal(typeof body.stale, 'boolean')
  assert.equal(typeof body.truncated, 'boolean')
  assert.ok(Array.isArray(body.events))
})

// A bigint in the snapshot would make JSON.stringify throw and the route answer 500 on its first
// real request — the head and the cursor are both bigint.
test('the heights serialize instead of throwing', async (t) => {
  const api = await listen(t)
  const response = await fetch(`${api.url}/activity`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/json')
})

// Only GET. A convenience read surface that accepts writes is a surface nobody asked for.
test('the feed is read-only', async (t) => {
  const api = await listen(t)
  assert.equal((await fetch(`${api.url}/activity`, { method: 'POST' })).status, 405)
  assert.equal((await fetch(`${api.url}/activity`, { method: 'DELETE' })).status, 405)
})
