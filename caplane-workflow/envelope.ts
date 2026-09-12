import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { concatBytes } from '@noble/ciphers/utils.js'
import { x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { ENVELOPE } from './abi/frozen'

/** X25519 + HKDF-SHA256 + XChaCha20-Poly1305. Both bytes are bound into the key derivation. */
const SUPPORTED_VERSION = 1
const SUPPORTED_ALGORITHM = 1

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
	// Asserted, not ignored. These two bytes sit outside the AEAD, and until they were bound into
	// the derivation below nothing read them at all: flipping either produced a different
	// submission id for the same claim, and at the first version bump a dispatch on them would
	// have been an unauthenticated downgrade. Refusing here gives a reason; the binding is what
	// makes the refusal unavoidable.
	const version = envelope[ENVELOPE.version.offset]
	const algorithm = envelope[ENVELOPE.algorithm.offset]
	if (version !== SUPPORTED_VERSION) throw new Error(`unsupported envelope version ${version}`)
	if (algorithm !== SUPPORTED_ALGORITHM) throw new Error('unsupported envelope algorithm')

	const shared = x25519.getSharedSecret(recipientSecret, ephemeralPublicKey)
	// Derived, never the raw Diffie-Hellman output. RFC 7748 requires it, and it is what gives the
	// construction somewhere to bind the header and both public keys — so a shared secret forced
	// to a value an attacker knows is no longer a key they know.
	const key = hkdf(
		sha256,
		shared,
		undefined,
		concatBytes(
			new TextEncoder().encode('caplane-envelope-v1'),
			Uint8Array.of(version, algorithm),
			ephemeralPublicKey,
			x25519.getPublicKey(recipientSecret),
		),
		32,
	)
	const sealed = xchacha20poly1305(key, nonce).decrypt(
		envelope.subarray(ENVELOPE.ciphertext.offset),
	)
	return {
		authorizedSubmitter: sealed.subarray(0, AUTHORIZED_SUBMITTER_BYTES),
		claim: sealed.subarray(AUTHORIZED_SUBMITTER_BYTES),
	}
}
