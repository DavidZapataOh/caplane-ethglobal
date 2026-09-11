import { keccak_256 } from '@noble/hashes/sha3.js'
import { encodeComponentPreimage, encodeTuplePreimage } from './encode'
import { COMPONENT_ORDER, type ClaimComponents } from './schema'

const toHex = (b: Uint8Array): `0x${string}` =>
  `0x${Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('')}`

/** Internal: the unpeppered form feeds the lien id, the peppered form feeds the index. */
const digests = (claimType: number, c: ClaimComponents, pepper?: Uint8Array): Uint8Array[] =>
  COMPONENT_ORDER.map((name, i) => keccak_256(encodeComponentPreimage(claimType, i, c[name], pepper)))

/**
 * The registry key. Seven fixed-width digests, never seven strings: joining the strings
 * collides when a character moves from one variable field into the next, using values a real
 * ledger issued.
 *
 * Pepper-free, so a browser, the SDK and any third party derive the same value from a claim
 * they already hold. That is what makes the registry answerable without asking us.
 */
export const lienIdOf = (claimType: number, c: ClaimComponents): `0x${string}` =>
  toHex(keccak_256(encodeTuplePreimage(claimType, digests(claimType, c))))

/**
 * Peppered, so only the enclave can build the index these are looked up in. Without the pepper
 * the index would be brute-forceable — currency, country, due date and amount bucket are
 * low-entropy enough to enumerate.
 */
export const componentCommitments = (
  claimType: number,
  c: ClaimComponents,
  pepper: Uint8Array,
): `0x${string}`[] => digests(claimType, c, pepper).map(toHex)
