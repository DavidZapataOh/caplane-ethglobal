import { readFileSync } from 'node:fs'
import { expect, test } from 'bun:test'
import { type Hex, hexToBytes, toEventSelector, zeroAddress, zeroHash } from 'viem'
import { ReportKind } from './abi/frozen'
import { nonceFor } from './report'
import { SETTLED_TOPIC, decodeSettled, releaseBody } from './settlement'

const LIEN = `0x${'ab'.repeat(32)}` as Hex

// Pinned against the contract's own source, the way the inbox topic is pinned against its ABI.
// A log trigger matches on topic0 and nothing else, so a signature that drifted downstream would
// stop the filter with no error and no releases, ever. Read from Solidity rather than from a
// generated ABI because no escrow ABI is emitted — a test that skipped when a file was missing
// would pass by doing nothing, which is the failure this whole audit kept finding.
test('the settled topic matches the escrow contract source', () => {
	const source = readFileSync('../contracts/src/CaplaneEscrow.sol', 'utf8')
	const declaration = /event\s+Settled\s*\(([^)]*)\)/.exec(source)
	expect(declaration).not.toBeNull()
	const types = (declaration?.[1] ?? '')
		.split(',')
		.map((p) => p.trim().split(/\s+/)[0])
		.join(',')
	expect(SETTLED_TOPIC).toBe(toEventSelector(`Settled(${types})`))
	// And the handler reads topics[1], so `lienId` must be the first indexed parameter.
	expect(declaration?.[1]).toMatch(/^\s*bytes32\s+indexed\s+lienId/)
})

// The escrow's signature is the whole filter. A log trigger matches on topic0, so a signature
// change downstream would stop the filter silently — no error, no releases, ever.
test('the topic is the one the deployed escrow emits', () => {
	expect(SETTLED_TOPIC).toBe(toEventSelector('Settled(bytes32,uint256,uint256)'))
	expect(SETTLED_TOPIC).toBe('0x2a20f8d2d0f487a3016d77037b3c5768216a3dc76401d33abf5dc381af7171cb')
})

// Topics arrive as bytes, not strings. Handing a string to a bytes decoder does not throw — it
// returns `0xundefinedundefined…` — so the fixture has to be the shape the runtime delivers.
test('the lien comes out of the indexed topic, not the data', () => {
	expect(decodeSettled({ topics: [hexToBytes(SETTLED_TOPIC), hexToBytes(LIEN)] })).toBe(LIEN)
})

// A release carries no commitments: the index write belongs to the record path only, and a
// populated array here would be an index the registry never asked for.
test('a release body carries no commitments and no money', () => {
	const body = releaseBody(LIEN)
	expect(body.kind).toBe(ReportKind.Release)
	expect(body.componentCommitments).toEqual([])
	expect(body.advanceUsdc6).toBe(0n)
	expect(body.rateBps).toBe(0)
	expect(body.expiresAt).toBe(0n)
	expect(body.submissionId).toBe(zeroHash)
	expect(body.borrower).toBe(zeroAddress)
})

// Release and Default land on the same lien. Without the kind byte in the preimage the second one
// reverts as a replay — after deploy, with no test having said so.
test('release and default do not share a nonce', () => {
	expect(releaseBody(LIEN).nonce).not.toBe(nonceFor(LIEN, ReportKind.Default))
	expect(releaseBody(LIEN).nonce).toBe(nonceFor(LIEN, ReportKind.Release))
})
