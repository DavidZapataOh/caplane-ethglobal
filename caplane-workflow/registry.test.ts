import { readFileSync } from 'node:fs'
import { ClaimType } from './abi/frozen'
import { expect, test } from 'bun:test'
import type { Hex } from 'viem'
import { NO_LIEN } from '../claim/match'
import { batchBody, commitmentsOf, decodeBatch, verdictOf } from './registry'

const PEPPER = new Uint8Array(32).fill(7)
const IDENTITY = '0x3339646565666162396600000000000000000000000000000000000000000000'
const ZEROS = `0x${'0'.repeat(128)}`
const SOME_LIEN = `0x${'ab'.repeat(32)}` as const
const CLAIM = {
	debtorTaxId: 'Bayside Club',
	invoiceNumber: 'ORC1043',
	amountMinor: '27500000',
	currency: 'AUD',
	dueDate: '2026-12-31',
	issuerTaxId: 'e1218a28',
	country: 'AU',
}

// Seven, always: the view returns zeros for any other length, which is indistinguishable from
// "no collision". A derivation that silently produced six would read as a clean registry.
test('the derivation produces exactly seven commitments', () => {
	expect(commitmentsOf(ClaimType.Invoice, CLAIM, PEPPER)).toHaveLength(7)
})

// The pepper is what makes the index unguessable: currency, country, due date and amount bucket
// are low-entropy enough to enumerate exhaustively.
test('a different pepper produces different commitments', () => {
	const other = commitmentsOf(ClaimType.Invoice, CLAIM, new Uint8Array(32).fill(9))
	for (const [i, c] of commitmentsOf(ClaimType.Invoice, CLAIM, PEPPER).entries()) expect(c).not.toBe(other[i])
})

// An empty registry, a wrong-length array and a wrong address all look like "no collision".
// The second element reads an immutable whose value is known offline, so a response carrying it
// cannot have come from any of the three.
test('the batch carries a discriminating second call', () => {
	const body = JSON.parse(
		Buffer.from(batchBody(commitmentsOf(ClaimType.Invoice, CLAIM, PEPPER), '0xabc', 61_668_574n), 'base64').toString(),
	)
	expect(body).toHaveLength(2)
	expect(body[1].params[0].data).toBe('0x007271ce')
})

// The read is pinned to the trigger's own block, never to the tip: an unpinned read is a race in
// which two deliveries of one event observe different registries and emit contradictory reports,
// both of which land because their nonces differ by kind.
test('the read is pinned to the trigger block, not the tip', () => {
	const body = JSON.parse(
		Buffer.from(batchBody(commitmentsOf(ClaimType.Invoice, CLAIM, PEPPER), '0xabc', 61_668_574n), 'base64').toString(),
	)
	for (const call of body) expect(call.params[1]).toBe('0x3acfcde')
	expect(JSON.stringify(body)).not.toContain('latest')
})

// `now()` exists on the runtime and the envelope's `id` is exactly where a timestamp would land.
test('the request carries no clock', () => {
	const body = JSON.parse(
		Buffer.from(batchBody(commitmentsOf(ClaimType.Invoice, CLAIM, PEPPER), '0xabc', 61_668_574n), 'base64').toString(),
	)
	expect(body.map((c: { id: number }) => c.id)).toEqual([1, 2])
})

// A batch answers out of order and per-member errors are not fatal, so results are matched by id.
// Reading positionally would attribute the registry's answer to the wrong call.
test('a batch response is read by id, not by position', () => {
	const out = decodeBatch([
		{ jsonrpc: '2.0', id: 2, result: IDENTITY },
		{ jsonrpc: '2.0', id: 1, result: ZEROS },
	])
	expect(out.kind).toBe('ok')
	expect(out.kind === 'ok' && out.matched).toBe(0)
})

// An over-gas eth_call is an RPC error, never a low count. Reading it as "no collision" is a
// silent double-pledge machine.
test('an rpc error is not a clean answer', () => {
	const out = decodeBatch([
		{ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'out of gas' } },
		{ jsonrpc: '2.0', id: 2, result: IDENTITY },
	])
	expect(out.kind).toBe('error')
})

// A wrong address returns `0x`, which viem refuses to decode — measured. That exception must be
// an answer, not an escaped throw: the identity call is what tells the two apart.
test('empty returndata is undecidable, not clean', () => {
	const out = decodeBatch([
		{ jsonrpc: '2.0', id: 1, result: '0x' },
		{ jsonrpc: '2.0', id: 2, result: '0x' },
	])
	expect(out.kind).toBe('error')
})

// And the discriminator has to discriminate: a registry that answered but whose identity does not
// match is the wrong registry, whatever the first element said.
test('a wrong identity invalidates the whole read', () => {
	const out = decodeBatch([
		{ jsonrpc: '2.0', id: 1, result: ZEROS },
		{ jsonrpc: '2.0', id: 2, result: `0x${'1'.repeat(64)}` },
	])
	expect(out.kind).toBe('error')
})

// Comparing against the ten bytes of the name instead of the padded word passes on a hand-made
// fixture and never matches in production, where `bytes10` arrives left-aligned in a full word.
test('the identity compared is the padded word, not the ten bytes', () => {
	expect(readFileSync('./registry.ts', 'utf8')).toContain(IDENTITY)
})

// The enclave's confidentiality is a property of which runtime the request is handed to. These
// are the ways it silently stops being one.
test('the read never leaves the enclave', () => {
	const source = readFileSync('./registry.ts', 'utf8')
	expect(source).not.toContain('usingTheDons')
	expect(source).not.toContain('EVMClient')
	expect(source.match(/sendRequest\(/g) ?? []).toHaveLength(1)
})

// A cached registry query is a persisted record of which commitment was asked about, and the
// production limits leave the cache alive with a ten-minute age.
test('nothing about the query is cached', () => {
	expect(readFileSync('./registry.ts', 'utf8')).toContain('store: false')
})

// --- the third verdict --------------------------------------------------------

// Three outcomes, and the third exists because a debtor with enough liens makes the view exceed
// the node's gas cap. Collapsing it into "clear" is how a registry that cannot answer becomes a
// registry that says yes.
test('an unanswerable read is undecidable, never clear', () => {
	expect(verdictOf(ClaimType.Invoice, { kind: 'error', reason: 'out of gas' }).status).toBe('undecidable')
	expect(verdictOf(ClaimType.Invoice, { kind: 'ok', lienId: NO_LIEN as Hex, matched: 0 }).status).toBe('clear')
	expect(verdictOf(ClaimType.Invoice, { kind: 'ok', lienId: SOME_LIEN, matched: 6 }).status).toBe('collision')
})

// Below threshold is genuinely clear: the count is a real measurement, not a failure.
test('a candidate under the threshold is clear', () => {
	expect(verdictOf(ClaimType.Invoice, { kind: 'ok', lienId: SOME_LIEN, matched: 5 }).status).toBe('clear')
})

// A count with no candidate is a malformed response, not a near miss. The shared decision throws
// on it, and that throw must become the third verdict rather than escape the handler.
test('an inconsistent response is undecidable', () => {
	expect(verdictOf(ClaimType.Invoice, { kind: 'ok', lienId: NO_LIEN as Hex, matched: 4 }).status).toBe('undecidable')
})

// The point of three verdicts is that they are three. A test that only ever saw "clear" would
// pass against an implementation that returned "clear" unconditionally.
test('the four inputs produce three distinct verdicts', () => {
	const statuses = [
		verdictOf(ClaimType.Invoice, { kind: 'error', reason: 'out of gas' }).status,
		verdictOf(ClaimType.Invoice, { kind: 'ok', lienId: NO_LIEN as Hex, matched: 0 }).status,
		verdictOf(ClaimType.Invoice, { kind: 'ok', lienId: SOME_LIEN, matched: 5 }).status,
		verdictOf(ClaimType.Invoice, { kind: 'ok', lienId: SOME_LIEN, matched: 6 }).status,
	]
	expect(new Set(statuses)).toEqual(new Set(['undecidable', 'clear', 'collision']))
})

// The threshold lives in the claim package, published on purpose: publishing it is what makes the
// measured false-match rate checkable. A copy here would drift from the rate that was measured.
test('the threshold is imported, never redeclared', () => {
	expect(readFileSync('./registry.ts', 'utf8')).not.toMatch(/THRESHOLD\s*=/)
})
