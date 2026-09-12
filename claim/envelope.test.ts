import { readFileSync } from 'node:fs'
import { expect, test } from 'bun:test'
import { ENVELOPE } from './abi/frozen'
import { parse, seal } from './envelope'
import vectors from './fixtures/envelope.json'
import { open } from '../caplane-workflow/envelope'

const hex = (s: string) => Uint8Array.from(Buffer.from(s.replace(/^0x/, ''), 'hex'))
const v = vectors.canonical
const PLAINTEXT = new TextEncoder().encode('a claim')
const recipientSecret = hex(v.recipientSecret)
const recipientPublicKey = hex(v.recipientPublicKey)
const SUBMITTER = hex(v.authorizedSubmitter)

// Fixed ephemeral key and nonce, so the bytes are reproducible and the vector is a contract
// rather than a snapshot of whatever entropy the machine had.
test('produces the exact bytes the vector pins', () => {
	const out = seal(
		new TextEncoder().encode(v.plaintext),
		hex(v.recipientPublicKey),
		hex(v.authorizedSubmitter),
		hex(v.ephemeralSecret),
		hex(v.nonce),
	)
	expect(`0x${Buffer.from(out).toString('hex')}`).toBe(v.envelope)
})

// The layout is frozen. Reading it from the frozen constants instead of slicing by hand is the
// whole point: a change there has to break this, not drift silently past it.
test('lays the envelope out the way the frozen schema says', () => {
	const parsed = parse(hex(v.envelope))
	expect(parsed.version).toBe(1)
	expect(parsed.algorithm).toBe(1)
	expect(parsed.ephemeralPublicKey.length).toBe(32)
	expect(parsed.nonce.length).toBe(24)
})

// The cap is a CRE budget expressed in bytes, and an event above it is dropped with no failure
// and no retry. A claim's seven components serialize to roughly 200 bytes.
test('a real claim seals well inside the cap', () => {
	const out = seal(
		new TextEncoder().encode(v.realisticClaim),
		hex(v.recipientPublicKey),
		hex(v.authorizedSubmitter),
		hex(v.ephemeralSecret),
		hex(v.nonce),
	)
	expect(out.length).toBeLessThan(4096)
})

// Two seals of the same claim must differ, or the ciphertext itself becomes a correlatable
// identifier for a receivable that is supposed to be secret.
test('the same claim seals to different bytes every time', () => {
	const p = new TextEncoder().encode(v.plaintext)
	const a = seal(p, hex(v.recipientPublicKey), hex(v.authorizedSubmitter))
	const b = seal(p, hex(v.recipientPublicKey), hex(v.authorizedSubmitter))
	expect(Buffer.from(a).toString('hex')).not.toBe(Buffer.from(b).toString('hex'))
})

// The raw X25519 output was the AEAD key directly. RFC 7748 requires a hash or KDF there, and the
// cost of skipping it is not the one bit of bias: it is that the construction has no place to bind
// anything. With a KDF, a shared secret an attacker somehow forced to a known constant no longer
// yields a known key, and the header can be bound at zero cost.
test('the aead key is derived, not the raw diffie-hellman output', () => {
	const source = readFileSync('./envelope.ts', 'utf8')
	expect(source).toContain('hkdf')
	expect(source).not.toMatch(/xchacha20poly1305\(\s*shared\b/)
})

// Version and algorithm sat outside the AEAD and nothing read them. Flipping them produced a
// different submission id for the same claim — the inbox's duplicate guard was decorative — and
// at the first version bump any dispatch on those bytes would be an unauthenticated downgrade.
test('a flipped header byte no longer opens', () => {
	const sealed = seal(PLAINTEXT, recipientPublicKey, SUBMITTER)
	expect(open(sealed, recipientSecret).claim).toEqual(PLAINTEXT)
	for (const at of [ENVELOPE.version.offset, ENVELOPE.algorithm.offset]) {
		const tampered = Uint8Array.from(sealed)
		tampered[at] = (tampered[at] ?? 0) ^ 0xff
		expect(() => open(tampered, recipientSecret)).toThrow()
	}
})

// And the opener asserts what it supports rather than ignoring it.
test('an unsupported version is refused with a reason, not a tag failure', () => {
	const sealed = seal(PLAINTEXT, recipientPublicKey, SUBMITTER, undefined, undefined, 2)
	expect(() => open(sealed, recipientSecret)).toThrow(/version/)
})

// Binding the ephemeral and recipient keys into the derivation is what stops one envelope's key
// from being reachable from another context.
test('the same plaintext under two ephemeral keys yields unrelated ciphertexts', () => {
	const a = seal(PLAINTEXT, recipientPublicKey, SUBMITTER)
	const b = seal(PLAINTEXT, recipientPublicKey, SUBMITTER)
	expect(a.subarray(ENVELOPE.ciphertext.offset)).not.toEqual(b.subarray(ENVELOPE.ciphertext.offset))
	expect(open(a, recipientSecret).claim).toEqual(open(b, recipientSecret).claim)
})
