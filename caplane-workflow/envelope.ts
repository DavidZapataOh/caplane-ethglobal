import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { x25519 } from '@noble/curves/ed25519.js'
import { ENVELOPE } from './abi/frozen'

/**
 * Twenty raw bytes, not the padded 32-byte form the event topic carries. The caller trims the
 * topic to compare, and getting the width wrong is a one-character mistake whose failure looks
 * like a relay rather than a bug.
 */
export const AUTHORIZED_SUBMITTER_BYTES = 20

/**
 * Opens a sealed claim inside the enclave. Consumes no randomness, which is why it can run here
 * at all: the guest has no entropy source, only a seeded generator the platform documents as not
 * cryptographically secure.
 *
 * Returns the address the sealer named as entitled to submit, alongside the claim itself. The
 * comparison against the event's submitter is the caller's, because the caller is what has the
 * event. Throws on a bad tag; there is no partial result to inspect.
 */
export const open = (
	envelope: Uint8Array,
	recipientSecret: Uint8Array,
): { authorizedSubmitter: Uint8Array; claim: Uint8Array } => {
	const ephemeralPublicKey = envelope.subarray(
		ENVELOPE.ephemeralPublicKey.offset,
		ENVELOPE.ephemeralPublicKey.offset + ENVELOPE.ephemeralPublicKey.bytes,
	)
	const nonce = envelope.subarray(
		ENVELOPE.nonce.offset,
		ENVELOPE.nonce.offset + ENVELOPE.nonce.bytes,
	)
	const shared = x25519.getSharedSecret(recipientSecret, ephemeralPublicKey)
	const sealed = xchacha20poly1305(shared, nonce).decrypt(
		envelope.subarray(ENVELOPE.ciphertext.offset),
	)
	return {
		authorizedSubmitter: sealed.subarray(0, AUTHORIZED_SUBMITTER_BYTES),
		claim: sealed.subarray(AUTHORIZED_SUBMITTER_BYTES),
	}
}
