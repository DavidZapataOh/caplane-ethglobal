// Frozen alongside contracts/src/interfaces. Zero runtime dependencies by design:
// this module is vendored into the CRE workflow, which compiles to WASM.

/** Solidity uint128/uint64 → bigint. uint32/uint8 → number: both fit exactly and are not amounts. */
export type Lien = {
  borrower: `0x${string}`
  rateBps: number
  createdAt: bigint
  advanceUsdc6: bigint
  expiresAt: bigint
  status: number
  submissionId: `0x${string}`
}

export const LienStatus = { None: 0, Active: 1, Released: 2, Defaulted: 3 } as const
export const ReportKind = { Unset: 0, Record: 1, Release: 2, Default: 3, Reject: 4 } as const
export const RejectReason = {
  Unset: 0,
  AlreadyEncumbered: 1,
  DebtorUnconfirmed: 2,
  ComplianceHit: 3,
  SourceUnverified: 4,
  BelowThreshold: 5,
  /**
   * The sealed plaintext names the address entitled to submit, and the event names the address
   * that paid. A relay of somebody else's ciphertext differs on those two, and until now there
   * was no code for it — the rejection had nothing to say.
   *
   * Additive and TypeScript-only: the registry emits a `uint8` and there is no enum in Solidity,
   * so nothing regenerates. But the three copies are checked byte for byte, so it is three edits
   * or none.
   */
  UnauthorizedSubmitter: 6,
} as const

export const UNITS = {
  /** USDC ERC-20 base units. Never native gas wei (18 on Arc), never the claim's ISO 4217 minor units. */
  advanceUsdc6: { decimals: 6, solidity: 'uint128', typescript: 'bigint' },
  /** Basis points of the advance against face value. 150 = 1.50%. Flat over the term, not annualised. */
  rateBps: { scale: 10_000, solidity: 'uint32', typescript: 'number' },
  /** Unix seconds, UTC. Stamped on-chain with block.timestamp, never with the enclave clock. */
  timestamps: { unit: 'seconds', solidity: 'uint64', typescript: 'bigint' },
} as const

/**
 * Domain separation for the commitment preimage. The version byte lets the derivation evolve
 * without invalidating existing liens; the claim-type byte is what lets a lease and an invoice
 * share one registry without colliding.
 *
 *   lienId      = keccak256(VERSION ‖ claimType ‖ canonical tuple)
 *   component i = keccak256(VERSION ‖ claimType ‖ i ‖ canonical component ‖ pepper)
 *
 * The pepper is a Vault secret held only inside the enclave. It does not rotate: rotating it
 * would invalidate the whole index. The version byte exists so a future reindex is possible.
 */
export const COMMITMENT = { version: 1, pepperVersion: 1 } as const
export const ClaimType = { Unset: 0, Invoice: 1, Lease: 2, Equipment: 3 } as const

/**
 * Tuple positions the registry indexes: debtor, invoice number, due date. The amount bucket is
 * position 2 and is deliberately absent — a doubling bucket takes a handful of values, so one
 * posting list would hold a large share of the registry and the walk would grow with it. At the
 * 6-of-7 threshold at most one discriminating component differs, so at least two of these three
 * still agree: indexing three cannot miss a match.
 *
 * This is the single place the choice is written. Solidity mirrors it; nothing re-types it.
 */
export const INDEXED_POSITIONS = [0, 1, 3] as const

/**
 * The browser→enclave envelope carried by `ClaimSubmitted.ciphertext`.
 * Packed, in this order. The whole event must stay under the 5,000-byte LogTrigger budget.
 */
export const ENVELOPE = {
  version: { offset: 0, bytes: 1 },
  algorithm: { offset: 1, bytes: 1 }, // 1 = X25519 + XChaCha20-Poly1305
  ephemeralPublicKey: { offset: 2, bytes: 32 },
  nonce: { offset: 34, bytes: 24 },
  ciphertext: { offset: 58, bytes: 'variable' },
  maxTotalBytes: 4096,
} as const

export const CHAIN = {
  arcTestnet: {
    chainId: 5042002,
    /**
     * BigInt is mandatory, not stylistic. 3034092155422581607 exceeds Number.MAX_SAFE_INTEGER,
     * so JSON.parse silently rounds it to 3034092155422582000 — verified against the CLI's own
     * `supported-chains --output json`. Handling it as a Number corrupts the identifier.
     */
    chainSelector: 3034092155422581607n,
    forwarder: '0x76c9cf548b4179F8901cda1f8623568b58215E62',
    usdc: '0x3600000000000000000000000000000000000000',
    usdcDecimals: 6,
  },
} as const

/** Written by the deploy script; read by every consumer. Values, never retyped constants. */
export type Deployments = {
  network: string
  chainId: number
  registry: `0x${string}`
  inbox: `0x${string}`
  pool: `0x${string}`
  escrow: `0x${string}`
  /** Recorded as evidence. NOT pinned by the contract — it changes on every code or config edit. */
  workflowId: `0x${string}`
  workflowOwner: `0x${string}`
  workflowName: `0x${string}`
  /** X25519 public key submissions are sealed to. Value comes from 03/02. */
  enclavePublicKey: `0x${string}`
  blockNumber: number
}
