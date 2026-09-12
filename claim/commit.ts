import { keccak_256 } from '@noble/hashes/sha3.js'
import { encodeComponentPreimage, encodeTuplePreimage } from './encode'
import { COMPONENT_ORDER, type ClaimComponents } from './schema'

const toHex = (b: Uint8Array): `0x${string}` =>
  `0x${Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('')}`

/** Internal: the unpeppered form feeds the lien id, the peppered form feeds the index. */
const digests = (claimType: number, c: ClaimComponents, pepper?: Uint8Array): Uint8Array[] =>
  COMPONENT_ORDER.map((name, i) => keccak_256(encodeComponentPreimage(claimType, i, c[name], pepper)))

/**
 * What the debtor's confirmation commits to. Seven fixed-width digests, never seven strings:
 * joining the strings collides when a character moves from one variable field into the next,
 * using values a real ledger issued.
 *
 * Pepper-free, and it has to be: the tool that collects the debtor's signature runs on their
 * side, outside the enclave, and giving it the pepper would take the pepper out of the enclave
 * and defeat the index it exists to protect. That is safe here because this value never leaves
 * the sealed envelope — it is compared inside, against a signature that also travels inside.
 */
export const claimIdOf = (claimType: number, c: ClaimComponents): `0x${string}` =>
  toHex(keccak_256(encodeTuplePreimage(claimType, digests(claimType, c))))

/**
 * The registry key, peppered.
 *
 * It was this same hash without the pepper, and it is published in `LienRecorded` and is the
 * argument to every public view. The seven components carry roughly eighteen bits between them —
 * currency, country and the issuer are constants of one ledger and contribute none — so the
 * published key inverted by brute force: a real lien was recovered in 71 ms against the seeded
 * corpus, yielding the debtor, the invoice number, the due date and the amount bucket. The pepper
 * that protects the component index has to protect the key derived from the same components.
 *
 * The cost is real and is stated rather than hidden: a third party can no longer derive a lien id
 * from a claim they hold, so `isEncumbered` is no longer answerable without asking the enclave.
 * Restoring that means an enclave-side lookup, not a pepper-free key.
 */
export const lienIdOf = (
  claimType: number,
  c: ClaimComponents,
  pepper: Uint8Array,
): `0x${string}` =>
  toHex(keccak_256(encodeTuplePreimage(claimType, digests(claimType, c), pepper)))

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
