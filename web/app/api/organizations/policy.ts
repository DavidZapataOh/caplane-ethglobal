/**
 * A policy denial, told apart from the other controls that also answer 400.
 *
 * `insufficient_funds` comes from simulation and
 * `insufficient_correct_authorization_signatures` from a key quorum; reporting either as a policy
 * denial would claim a block that never happened, and the interface would tell a business its
 * treasury rule stopped a transfer when the wallet was simply empty.
 *
 * The same predicate exists in the evidence script that first measured these three codes against
 * the live API. It is duplicated rather than imported because that script is its own package with
 * its own dependency set — the same boundary every other package in this repository keeps — and a
 * one-line predicate is cheaper to duplicate, with its own test, than to couple two build graphs
 * over.
 */
export const isPolicyViolation = (e: { status?: number; error?: { code?: string } }): boolean =>
  e.status === 400 && e.error?.code === 'policy_violation'

/**
 * The threshold a new organization's treasury policy starts with, in wei of the native asset.
 * Arc's native asset is USDC at 18 decimals, so this is one cent — deliberately small enough that
 * a live demonstration can cross it without the wallet needing to be meaningfully funded.
 */
export const THRESHOLD_WEI = 10_000_000_000_000_000n
