import { type Address, parseAbiItem } from 'viem'
import { inboxAbi } from '../abi/index.js'
import type { CaplaneClient } from './client.js'
import { deployments } from './deployments.js'
import { DEPLOYED_AT, MAX_SPAN, liensOf, withRetry } from './history.js'
import { type Lien, type RejectReason, lienOf } from './lien.js'

export type Submission = { submissionId: `0x${string}`; blockNumber: bigint }

export type Outcome =
  | { status: 'pending' }
  | { status: 'rejected'; reason: (typeof RejectReason)[keyof typeof RejectReason] }
  | { status: 'active' | 'released' | 'defaulted'; lien: Lien }

// Parsed from the signature rather than searched for inside the vendored ABI: viem keeps the
// argument types that way, and `history.ts` already reads its own event exactly like this.
const CLAIM_SUBMITTED = parseAbiItem(
  'event ClaimSubmitted(bytes32 indexed submissionId, address indexed submitter, bytes ciphertext)',
)
const SUBMISSION_REJECTED = parseAbiItem(
  'event SubmissionRejected(bytes32 indexed submissionId, uint8 reasonCode)',
)

/**
 * Who sent a submission, read through the quorum like every other point read here.
 *
 * It matters more than most: a caller uses this to decide whether a submission is its own, so an
 * endpoint free to lie about it is an endpoint free to hand one organization another's history.
 * Agreeing across endpoints is what makes the answer a property of the chain rather than of
 * whichever node replied first.
 */
export const submitterOf = (
  client: CaplaneClient,
  submissionId: `0x${string}`,
): Promise<Address> =>
  client.agree((endpoint) =>
    endpoint.readContract({
      address: deployments.inbox,
      abi: inboxAbi,
      functionName: 'submitterOf',
      args: [submissionId],
    }),
  ) as Promise<Address>

/**
 * Every submission an address has made, paginated exactly as `liensOf` paginates by borrower —
 * the endpoint refuses a span wider than ten thousand blocks, and a sweep that started near the
 * head would silently return an empty history for anything older.
 */
export const submissionsOf = async (
  client: CaplaneClient,
  submitter: Address,
  options: { fromBlock?: bigint } = {},
): Promise<Submission[]> => {
  const toBlock = await client.read.getBlockNumber()
  const found: Submission[] = []
  for (let from = options.fromBlock ?? DEPLOYED_AT; from <= toBlock; from += MAX_SPAN) {
    const to = from + MAX_SPAN - 1n > toBlock ? toBlock : from + MAX_SPAN - 1n
    const logs = await withRetry(
      () =>
        client.read.getLogs({
          address: deployments.inbox,
          event: CLAIM_SUBMITTED,
          args: { submitter },
          fromBlock: from,
          toBlock: to,
        }),
    )
    for (const log of logs) {
      found.push({
        submissionId: log.args.submissionId as `0x${string}`,
        blockNumber: log.blockNumber as bigint,
      })
    }
  }
  return found
}

/**
 * What became of a submission: refused, recorded, or not yet answered.
 *
 * The two halves are keyed differently because the events are. A refusal indexes the submission,
 * so it is found directly. A recorded lien indexes the borrower and never the submission, so the
 * borrower's liens are walked and each one's stored `submissionId` is compared — `liensOf` already
 * does that sweep with the same span and retry, so it is reused rather than written twice.
 *
 * A refusal carries no lien, and none is attached: what a refused financier cannot learn about the
 * claim that beat them is absent from the event itself, not removed here.
 *
 * `fromBlock` narrows both sweeps for a caller that knows when its own history starts. It defaults
 * to the deployment block because a head-relative default would answer "pending" for anything
 * older than ten thousand blocks, which a business would read as its claim having vanished.
 */
export const outcomeOf = async (
  client: CaplaneClient,
  submissionId: `0x${string}`,
  submitter: Address,
  options: { fromBlock?: bigint } = {},
): Promise<Outcome> => {
  const fromBlock = options.fromBlock ?? DEPLOYED_AT
  const toBlock = await client.read.getBlockNumber()
  for (let from = fromBlock; from <= toBlock; from += MAX_SPAN) {
    const to = from + MAX_SPAN - 1n > toBlock ? toBlock : from + MAX_SPAN - 1n
    const refusals = await withRetry(
      () =>
        client.read.getLogs({
          address: deployments.registry,
          event: SUBMISSION_REJECTED,
          args: { submissionId },
          fromBlock: from,
          toBlock: to,
        }),
    )
    const refusal = refusals[0]
    if (refusal !== undefined) {
      return {
        status: 'rejected',
        reason: refusal.args.reasonCode as (typeof RejectReason)[keyof typeof RejectReason],
      }
    }
  }

  const byStatus = { 1: 'active', 2: 'released', 3: 'defaulted' } as const
  for (const { lienId } of await liensOf(client, submitter, { fromBlock })) {
    const lien = await lienOf(client, lienId)
    if (lien.submissionId !== submissionId) continue
    const status = byStatus[lien.status as 1 | 2 | 3]
    if (status !== undefined) return { status, lien }
  }

  // Never "not found": the workflow may not have reported yet, and saying a claim was refused
  // because nothing has answered would be inventing a verdict the chain has not given.
  return { status: 'pending' }
}
