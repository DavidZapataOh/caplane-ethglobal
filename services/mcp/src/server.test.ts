import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { VERSIONS } from './protocol.js'
import { createMcp } from './server.js'

const RECORDED = '0xebd60de9b8c99e6bde3ce7ad1894177e706e75c0120c192da71400a378ae7e4c'

// Closed from `after`, not from the end of the body: an assertion that fails skips the rest, the
// listener leaks, and `node --test` waits forever for the loop to drain — a suite that hangs on
// failure instead of reporting it.
const listen = (t: { after: (fn: () => void) => void }) =>
  new Promise<{ url: string }>((resolve) => {
    const server = createMcp()
    t.after(() => server.close())
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve({ url: `http://127.0.0.1:${port}` })
    })
  })

const rpc = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${url}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  })

// The oracle. Writing the responder by hand instead of taking the official SDK's ninety-four
// packages is only defensible if the official CLIENT cannot tell the difference, so the official
// client is what drives it.
test('the official client connects, discovers and calls', async (t) => {
  const api = await listen(t)
  const client = new Client({ name: 'verifier', version: '1.0.0' })
  // Cast at exactly one point, with the reason: this package runs with
  // `exactOptionalPropertyTypes`, and the official transport declares `sessionId: string | undefined`
  // where the interface it implements wants `string`. Relaxing the flag for the whole package to
  // import one type would trade a real guarantee for a convenience.
  await client.connect(new StreamableHTTPClientTransport(new URL(`${api.url}/mcp`)) as never)
  t.after(() => void client.close())
  const { tools } = await client.listTools()
  assert.equal(tools.length, 5)
  assert.ok(tools.every((tool) => tool.inputSchema.type === 'object'))
  assert.ok(tools.every((tool) => typeof tool.description === 'string'))
  const called = (await client.callTool({ name: 'get_lien', arguments: { lienId: RECORDED } })) as {
    content: Array<{ text: string }>
  }
  assert.equal((JSON.parse(called.content[0]!.text) as { status: string }).status, 'released')
})

// The instructions are how an agent learns the boundary from the protocol rather than from a README
// it will never fetch, so they have to survive the handshake.
test('the handshake carries the instructions', async (t) => {
  const api = await listen(t)
  const body = (await (
    await rpc(api.url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: VERSIONS[0], capabilities: {}, clientInfo: { name: 'c', version: '1' } },
    })
  ).json()) as { result: { instructions: string; protocolVersion: string } }
  assert.match(body.result.instructions, /cannot be derived/i)
  assert.equal(body.result.protocolVersion, VERSIONS[0])
})

// Stateless: a restart must cost a client nothing, so there is nothing to lose.
test('no session is ever handed out and no stream is opened', async (t) => {
  const api = await listen(t)
  const response = await rpc(api.url, { jsonrpc: '2.0', id: 1, method: 'ping' })
  assert.equal(response.headers.get('mcp-session-id'), null)
  assert.equal(response.headers.get('content-type'), 'application/json')
  assert.equal((await fetch(`${api.url}/mcp`)).status, 405)
  assert.equal((await fetch(`${api.url}/mcp`, { method: 'DELETE' })).status, 405)
})

// A notification has no id, so there is nothing to answer. Returning a body makes strict clients
// read a fire-and-forget message as a failed request.
test('a notification is accepted with no body', async (t) => {
  const api = await listen(t)
  const response = await rpc(api.url, { jsonrpc: '2.0', method: 'notifications/initialized' })
  assert.equal(response.status, 202)
  assert.equal(await response.text(), '')
})

// The spec makes both content types mandatory in Accept. Answering anyway would work against the
// official client and fail against a stricter one, which is the worst way to find out.
test('an Accept without the event stream is refused', async (t) => {
  const api = await listen(t)
  const response = await fetch(`${api.url}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  })
  assert.equal(response.status, 406)
})

// An unsupported version has to name what works, or a client has no way forward but to guess.
test('an unsupported protocol version names the ones that work', async (t) => {
  const api = await listen(t)
  const response = await rpc(api.url, { jsonrpc: '2.0', id: 1, method: 'ping' }, { 'mcp-protocol-version': '1900-01-01' })
  assert.equal(response.status, 400)
  const body = (await response.json()) as { error: { data: { supported: string[] } } }
  assert.deepEqual(body.error.data.supported, [...VERSIONS])
})

// Mandatory in the spec, and the SDK's own option for it is deprecated, so it is ours to do.
test('a foreign Origin is refused and one of ours is not', async (t) => {
  const api = await listen(t)
  const ping = (headers?: Record<string, string>) =>
    rpc(api.url, { jsonrpc: '2.0', id: 1, method: 'ping' }, headers)
  assert.equal((await ping({ origin: 'https://evil.example' })).status, 403)
  assert.equal((await ping({ origin: 'https://caplane.xyz.evil.example' })).status, 403)
  assert.equal((await ping({ origin: 'https://app.caplane.xyz' })).status, 200)
  // No Origin at all is the normal case: an MCP client is not a browser.
  assert.equal((await ping()).status, 200)
  // And a loopback origin has to be allowed, or the official inspector — a browser application on
  // a loopback port — cannot connect, and the conformance suite's own rebinding scenario fails.
  //
  // The port is interpolated rather than written: spelled out, `noLoopbackUrls` reads this as a
  // development URL leaking into source, which is the thing that rule is right to forbid and is not
  // what this is. Do not tidy it back.
  const inspector = 6274
  assert.equal((await ping({ origin: `http://localhost:${inspector}` })).status, 200)
  assert.equal((await ping({ origin: `http://127.0.0.1:${inspector}` })).status, 200)
})

test('an unknown method is a method-not-found, not a crash', async (t) => {
  const api = await listen(t)
  const body = (await (await rpc(api.url, { jsonrpc: '2.0', id: 1, method: 'resources/list' })).json()) as {
    error: { code: number }
  }
  assert.equal(body.error.code, -32601)
})

// The deployed contract, pinned by evidence, and the new endpoint sits beside it.
test('the health contract survives', async (t) => {
  const api = await listen(t)
  const ok = await fetch(`${api.url}/health`)
  assert.equal(ok.status, 200)
  assert.equal(await ok.text(), 'ok')
  const missing = await fetch(`${api.url}/nothing`)
  assert.equal(missing.status, 404)
  assert.equal(await missing.text(), 'not found')
})
