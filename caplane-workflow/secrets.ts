import { type Hex, hexToBytes } from 'viem'

/**
 * Vault content is unvalidated input, and decoding it carelessly publishes it.
 *
 * viem's `hexToBytes` interpolates its ENTIRE argument into the error it throws, and that message
 * leaves the enclave as the execution failure reason. The two call sites hand it the X25519
 * private key every submission is sealed to and the pepper that salts the index — so a secret
 * uploaded as text rather than hex would print, to node operators, the one value the whole design
 * exists to keep from them. Neither secret can be rotated: the key is published in the deployment
 * record and the pepper has no reindex.
 *
 * This names the id and nothing else.
 */
export const secretBytes = (id: string, value: string): Uint8Array => {
	if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`secret ${id} is not 32 hex bytes`)
	return hexToBytes(value as Hex)
}
