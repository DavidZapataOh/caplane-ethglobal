import { expect, test } from 'bun:test'
import vectors from '../claim/fixtures/envelope.json'
import { open } from './envelope'

const hex = (s: string) => Uint8Array.from(Buffer.from(s.replace(/^0x/, ''), 'hex'))
const v = vectors.canonical

test('opens what the other side sealed', () => {
	const out = open(hex(v.envelope), hex(v.recipientSecret))
	expect(new TextDecoder().decode(out.claim)).toBe(v.plaintext)
})

// The attack this plan exists to close: the ciphertext is public in the calldata from the moment
// it is broadcast, and anyone may relay it from their own address. The plaintext names who was
// entitled to send it, so the enclave can tell the two apart — and say which it saw.
test('surfaces the authorized submitter so a relay can be told from the original', () => {
	const out = open(hex(v.envelope), hex(v.recipientSecret))
	expect(`0x${Buffer.from(out.authorizedSubmitter).toString('hex')}`).toBe(v.authorizedSubmitter)
})

// The event carries the submitter padded to 32 bytes; the envelope carries 20 raw. Comparing the
// two without trimming never matches, and the failure looks like a relay rather than a bug.
test('the event topic trims to exactly what the envelope carries', () => {
	const fromTopic = hex(v.submitterTopic).subarray(12)
	expect(Buffer.from(fromTopic).toString('hex')).toBe(v.authorizedSubmitter.slice(2))
})

test('refuses a tampered ciphertext', () => {
	const bad = hex(v.envelope)
	bad[bad.length - 1] ^= 1
	expect(() => open(bad, hex(v.recipientSecret))).toThrow()
})

test('refuses the wrong private key', () => {
	expect(() => open(hex(v.envelope), hex(v.otherRecipientSecret))).toThrow()
})
