import { COMPONENT_ORDER, type ClaimComponents } from './schema'

/**
 * How many of the seven components two claims share. Counted over COMPONENT_ORDER rather than
 * over the object's keys, because the index that order defines is what the commitment hashes,
 * and object key order is not it.
 *
 * No exclusions and no special cases: the registry compares peppered commitments for equality
 * and counts, and an empty component hashes to an ordinary commitment like any other. A claim
 * that cannot produce a component is refused when it is parsed instead, which is the only way
 * these two counts stay identical.
 *
 * This mirrors what the registry counts on-chain. If the two ever disagree, every rate measured
 * off-chain describes a system that is not the one running.
 */
export const agreement = (a: ClaimComponents, b: ClaimComponents): number =>
  COMPONENT_ORDER.filter((name) => a[name] === b[name]).length

/**
 * Six of seven, calibrated against a real ledger rather than taken from a paper.
 *
 * No published work gives a value for this. The nearest source fixes its own threshold at two
 * of sixty-four and says plainly that it is a cost parameter, not an accuracy one — and those
 * sixty-four are hash subsamples of a face embedding, not semantic fields. Two of seven here
 * would be currency plus jurisdiction, which every claim from one ledger shares.
 *
 * What is transferable is the method: fix the threshold by brute force against a real corpus
 * with a stated target. The target here is the largest threshold that still accepts every
 * reformatting real data produces, because each step down cheapens near-collision squatting
 * without rescuing any observed variant.
 *
 *   worst legitimate reformatting     6 of 7   an invoice number that lost its prefix
 *   a second real invoice, one ledger 3 of 7   the three components the ledger fixes
 *
 * Absolute, not a fraction of N: a fraction changes its denominator silently if a query ever
 * carries a different number of components.
 */
export const THRESHOLD = 6

export const isCollision = (a: ClaimComponents, b: ClaimComponents): boolean =>
  agreement(a, b) >= THRESHOLD

export type MatchResult = { lienId: string; matched: number }
export type Verdict = { collision: true; lienId: string } | { collision: false }

/** The registry's empty candidate. Exported so nothing downstream redeclares the same sentinel. */
export const NO_LIEN = `0x${'0'.repeat(64)}`

/**
 * The registry returns a candidate and a count; both are needed to decide.
 *
 * The inconsistent case is checked because this input is not trusted: it is decoded from a raw
 * JSON-RPC response to an endpoint named in configuration, not from a typed contract call. A
 * count with no candidate is either a wrong endpoint or a malformed response, and the verdict
 * this produces crosses the one-way door — so it refuses rather than guesses.
 */
export const decide = ({ lienId, matched }: MatchResult): Verdict => {
  const hasCandidate = lienId !== NO_LIEN
  if (!hasCandidate && matched > 0) {
    throw new Error(`inconsistent match: ${matched} components matched with no lien`)
  }
  return hasCandidate && matched >= THRESHOLD ? { collision: true, lienId } : { collision: false }
}
