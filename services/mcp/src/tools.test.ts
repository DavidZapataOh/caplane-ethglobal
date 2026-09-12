import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { INSTRUCTIONS, TOOLS, call } from './tools.js'

const RECORDED = '0xebd60de9b8c99e6bde3ce7ad1894177e706e75c0120c192da71400a378ae7e4c'
const REFUSED = '0x9c22eff8f4efee07013d86feaf5f1a559053004f1f61915873690d57e5a08b29'

const text = (outcome: { content: Array<{ text: string }> }) =>
  JSON.parse(outcome.content[0]!.text) as Record<string, unknown>

// An agent meets this server with no human to explain it. Every tool describes itself, and the
// schemas are strict: one that accepted extra properties would let an agent believe it had asked
// something it did not ask.
test('every tool is discoverable and typed', () => {
  assert.equal(TOOLS.length, 5)
  for (const tool of TOOLS) {
    assert.ok(tool.description.length > 40, tool.name)
    assert.equal(tool.inputSchema.type, 'object')
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name)
    assert.equal(tool.annotations?.readOnlyHint, true, tool.name)
    assert.match(tool.name, /^[a-z_]+$/)
  }
  assert.equal(new Set(TOOLS.map((tool) => tool.name)).size, 5)
})

// The boundary the pepper created is a protocol-level fact for an agent, not a footnote in a README
// it will never fetch. `instructions` is the only place in MCP where a server can say what not to
// ask.
test('the server declares what cannot be asked', () => {
  assert.match(INSTRUCTIONS, /cannot be derived/i)
  assert.match(INSTRUCTIONS, /lien id/i)
  assert.match(INSTRUCTIONS, /receipt/i)
})

test('a lien reads back with its terms and its receipt', async () => {
  const answer = text(await call('get_lien', { lienId: RECORDED }))
  assert.equal(answer.status, 'released')
  assert.equal(answer.borrower, '0x86Ec9f04485Db066CF155353f15eef356Ae90253')
  assert.equal(answer.advanceUsdc6, '8000000')
  const receipt = answer.receipt as { calls: unknown[]; endpoint: string }
  assert.equal(receipt.calls.length, 3)
  assert.match(receipt.endpoint, /^https:/)
})

// Encumbered is status exactly Active. Reading it as `status != 0` calls a released lien encumbered,
// which refuses a refinancing the registry deliberately allows.
test('encumbered means active and nothing else', async () => {
  const answer = text(await call('is_encumbered', { lienId: RECORDED }))
  assert.equal(answer.encumbered, false)
  assert.equal(answer.status, 'released')
  assert.match(String(answer.note), /status/i)
})

// Measured and load-bearing: the boolean answers false for a real lien and for an id nobody wrote.
// A tool surface built on it alone proves nothing about the chain, so the status has to travel with
// it and the difference has to be observable here.
test('the boolean cannot tell them apart but the status can', async () => {
  const recorded = text(await call('is_encumbered', { lienId: RECORDED }))
  const refused = text(await call('is_encumbered', { lienId: REFUSED }))
  assert.equal(recorded.encumbered, refused.encumbered)
  assert.notEqual(recorded.status, refused.status)
  assert.equal(refused.status, 'none')
})

test('a borrower enumerates, and the range travelled is reported', async () => {
  const answer = text(await call('liens_of_borrower', { borrower: '0x86Ec9f04485Db066CF155353f15eef356Ae90253' }))
  assert.ok(Array.isArray(answer.liens))
  assert.equal((answer.liens as unknown[]).length >= 1, true)
  assert.equal(typeof answer.fromBlock, 'string')
})

// An agent that cannot check it is talking to the real registry is an agent taking our word for it.
test('the identity is read from chain, not asserted', async () => {
  const answer = text(await call('registry_identity', {}))
  assert.equal(answer.chainId, 5042002)
  assert.equal(answer.workflowName, '0x33396465656661623966')
  assert.equal(answer.matchesFrozenIdentity, true)
  assert.ok(String(answer.codeHash).startsWith('0x'))
})

test('a rejection code explains itself without touching the chain', async () => {
  const answer = text(await call('explain_rejection', { code: 1 }))
  assert.equal(answer.reason, 'AlreadyEncumbered')
  const unknown = text(await call('explain_rejection', { code: 99 }))
  assert.equal(unknown.reason, undefined)
})

// A tool failure is a result with isError, never a JSON-RPC error: an agent that got -32602 would
// treat a bad argument as a broken server and stop, instead of fixing the argument.
test('a bad argument is a tool result, not a protocol error', async () => {
  const outcome = await call('get_lien', { lienId: 'not-a-hash' })
  assert.equal(outcome.isError, true)
  assert.match(outcome.content[0]!.text, /32 bytes/)
})

test('an unknown tool is refused by name', async () => {
  await assert.rejects(() => call('drop_lien', {}), /unknown tool/)
})

// Measured: the four deployed contracts were unverified until today, and nothing here may lean on
// the explorer as if it were proof. The receipt is the independent check an agent has.
test('no tool offers the explorer as proof', () => {
  const source = readFileSync(new URL('../../src/tools.ts', import.meta.url), 'utf8')
  assert.equal(/arcscan|explorer/i.test(source), false)
})
