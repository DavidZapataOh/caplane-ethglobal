import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from '@noble/ciphers/utils.js'
import { x25519 } from '@noble/curves/ed25519.js'
import { ENVELOPE } from './abi/frozen'

/**
 * The address entitled to submit, written into the plaintext as twenty raw bytes — lowercase,
 * unprefixed, first. Not the padded 32-byte form the event topic carries: the enclave trims the
 * topic to compare, and getting that width wrong is a one-character mistake whose failure looks
 * like a relay rather than a bug.
 */
export const AUTHORIZED_SUBMITTER_BYTES = 20

/**
 * Seals a claim to the enclave's public key, naming the address entitled to submit it.
 *
 * `claim` is the JSON of the seven submitted fields, UTF-8 encoded — raw, as written, not the
 * canonical text the commitment hashes. The enclave rejects a document short of any of them.
 * Compact or pretty-printed makes no difference; only the bytes' length does.
 *
 * The ciphertext is public in the calldata from the moment it is broadcast, so anyone can relay
 * it from their own address and obtain a verdict on somebody else's receivable. Naming the
 * authorized address inside the plaintext is what lets the enclave refuse that — and refuse it
 * with a reason, which binding the address as AEAD associated data would not.
 *
 * Randomness is required here and is unavailable inside the enclave, which is why sealing lives
 * on this side of the door and opening lives on the other.
 */
export const seal = (
	claim: Uint8Array,
	recipientPublicKey: Uint8Array,
	authorizedSubmitter: Uint8Array,
	ephemeralSecret: Uint8Array = x25519.utils.randomSecretKey(),
	nonce: Uint8Array = randomBytes(ENVELOPE.nonce.bytes),
): Uint8Array => {
	const ephemeralPublicKey = x25519.getPublicKey(ephemeralSecret)
	const shared = x25519.getSharedSecret(ephemeralSecret, recipientPublicKey)

	const sealed = new Uint8Array(AUTHORIZED_SUBMITTER_BYTES + claim.length)
	sealed.set(authorizedSubmitter, 0)
	sealed.set(claim, AUTHORIZED_SUBMITTER_BYTES)
	const ciphertext = xchacha20poly1305(shared, nonce).encrypt(sealed)

	const out = new Uint8Array(ENVELOPE.ciphertext.offset + ciphertext.length)
	out[ENVELOPE.version.offset] = 1
	out[ENVELOPE.algorithm.offset] = 1
	out.set(ephemeralPublicKey, ENVELOPE.ephemeralPublicKey.offset)
	out.set(nonce, ENVELOPE.nonce.offset)
	out.set(ciphertext, ENVELOPE.ciphertext.offset)
	return out
}

export const parse = (envelope: Uint8Array) => ({
	version: envelope[ENVELOPE.version.offset],
	algorithm: envelope[ENVELOPE.algorithm.offset],
	ephemeralPublicKey: envelope.subarray(
		ENVELOPE.ephemeralPublicKey.offset,
		ENVELOPE.ephemeralPublicKey.offset + ENVELOPE.ephemeralPublicKey.bytes,
	),
	nonce: envelope.subarray(ENVELOPE.nonce.offset, ENVELOPE.nonce.offset + ENVELOPE.nonce.bytes),
	ciphertext: envelope.subarray(ENVELOPE.ciphertext.offset),
})
