import { REGISTRY, TOPICS, rpc } from './chain.ts'
import type { Hex, Verdict } from './classify.ts'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Measured at about twelve seconds from submission to verdict; this waits well past that. */
const WINDOW_MS = 180_000
const POLL_MS = 6_000

const hexToNumber = (value: string) => Number(BigInt(value))

/**
 * What the enclave decided about *this* submission.
 *
 * Scoped to the submission id rather than to the latest event on the registry. Two attempts
 * overlapping — a slow verdict and the next iteration — would otherwise let one attempt read the
 * other's outcome, and the series would count a single refusal twice.
 *
 * Returns `pending` rather than throwing when the window closes. An absent verdict is a fact about
 * the run worth recording; turning it into an exception would drop the attempt out of the series
 * entirely and quietly improve the numbers.
 */
export const awaitVerdict = async (submissionId: Hex, fromBlock: bigint): Promise<Verdict> => {
  const deadline = Date.now() + WINDOW_MS
  const from = `0x${fromBlock.toString(16)}`

  while (Date.now() < deadline) {
    const rejected = (await rpc('eth_getLogs', [
      { address: REGISTRY, fromBlock: from, toBlock: 'latest', topics: [TOPICS.submissionRejected, submissionId] },
    ])) as Array<{ data: string; blockNumber: string }>
    const refusal = rejected[0]
    if (refusal !== undefined) {
      return { kind: 'rejected', reason: hexToNumber(refusal.data), block: BigInt(refusal.blockNumber) }
    }

    // A recorded lien does not name the submission in an indexed topic, so it is read by sweeping
    // the same span. It must never be missed: the harness recording a lien is the one outcome that
    // is an emergency rather than a result.
    const recorded = (await rpc('eth_getLogs', [
      { address: REGISTRY, fromBlock: from, toBlock: 'latest', topics: [TOPICS.lienRecorded] },
    ])) as Array<{ topics: string[] }>
    if (recorded.length > 0) return { kind: 'recorded' }

    await sleep(POLL_MS)
  }
  return { kind: 'pending' }
}
