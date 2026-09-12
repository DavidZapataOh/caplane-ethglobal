import { expect, test } from 'bun:test'
import { parse, seal } from './envelope'
import vectors from './fixtures/envelope.json'

const hex = (s: string) => Uint8Array.from(Buffer.from(s.replace(/^0x/, ''), 'hex'))
const v = vectors.canonical

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
