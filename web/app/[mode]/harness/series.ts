/**
 * Both addresses written here rather than imported across routes, the way every other directory in
 * this repository carries its own copy of the deployment book. The inbox is a different contract
 * from the registry, and only it knows who submitted.
 */
const REGISTRY = '0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b' as const
export const INBOX = '0xc5218fd1b6eb7c91f905871301bf8620bc8baf91' as const

const ENDPOINT = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? 'https://rpc.testnet.arc.io'

/**
 * `keccak256` of each signature, written out. Deriving them would pull a chain library onto a page
 * that never signs anything, which is the cost the public lookup already refused to pay.
 */
const TOPICS = {
  claimSubmitted: '0x8af2b32ba8e251a8a7c973226674ac1045c1be5b98c6717bd9c9f9ba8b6b801f',
  submissionRejected: '0x962951bdec41590ba264b9fbb9d3d88d92884bfced23604ae728204e68ef8760',
} as const

/**
 * Every code the registry can publish, named.
 *
 * A refused attempt rendered as a red row says the registry said no. It does not say the registry
 * said no *because the receivable was already pledged* — and that is the only refusal this page is
 * about. A run of anything else means the worker is broken, not that the index is working, and the
 * page has to be able to say which.
 */
export const REASON_LABEL: Record<number, string> = {
  0: 'refused without a stated reason',
  1: 'already pledged',
  2: 'the counterparty has not confirmed',
  3: 'refused on a compliance check',
  4: 'the source could not be verified',
  5: 'below the threshold to record',
  6: 'submitted by an unauthorised address',
  7: 'the claim could not be read',
  8: 'verification could not be reached',
  9: 'the envelope could not be opened',
}

export type Submission = { submissionId: string; blockNumber: bigint }
export type Refusal = { submissionId: string; reason: number; blockNumber: bigint }
export type Row = {
  submissionId: string
  submittedAt: bigint
  reason: number | undefined
  decidedAt: bigint | undefined
}

/**
 * Pairs what the worker sent with what the enclave decided about it.
 *
 * A submission with no verdict yet is kept rather than dropped: an attempt still in flight is part
 * of the run, and hiding it would make the page look tidier than the chain.
 */
export const joinSeries = (submissions: Submission[], refusals: Refusal[]): Row[] => {
  const byId = new Map(refusals.map((refusal) => [refusal.submissionId, refusal]))
  return submissions
    .map((submission) => {
      const refusal = byId.get(submission.submissionId)
      return {
        submissionId: submission.submissionId,
        submittedAt: submission.blockNumber,
        reason: refusal?.reason,
        decidedAt: refusal?.blockNumber,
      }
    })
    .sort((a, b) => Number(b.submittedAt - a.submittedAt))
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Paced and retried, because the endpoint rate-limits and two sweeps plus a height read are a burst
 * by nature. Measured on this page: the first deployment answered `429` and the panel reported no
 * attempts at all — a page that said "none" about a worker that had bounced ten times.
 *
 * The spacing and the backoff are the ones the public lookup already had to discover, reused rather
 * than rediscovered. A rejection that never clears is raised, never turned into an empty result:
 * an empty series reads as "the worker is not running", which is a different claim entirely.
 */
const call = async (method: string, params: unknown[]): Promise<unknown> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      const body = (await response.json()) as { result?: unknown; error?: { message: string } }
      if (body.error !== undefined) throw new Error(body.error.message)
      if (!response.ok) throw new Error(`rpc ${method} http ${response.status}`)
      return body.result
    } catch (error) {
      if (attempt === 5) throw error
      await pause(600 * 2 ** attempt)
    }
  }
}

const logs = async (params: Record<string, unknown>): Promise<Array<Record<string, never>>> =>
  ((await call('eth_getLogs', [params])) ?? []) as Array<Record<string, never>>

const padded = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`

/**
 * A recent window, not the whole history.
 *
 * Sweeping from the registry's deployment costs a page per ten thousand blocks and grows by about
 * seventeen pages a day, and the endpoint prunes older logs anyway. A page that degraded a little
 * more each day until it stopped answering would be a worse record than one that says plainly how
 * far back it looks. The complete series lives in the repository's evidence, which accumulates.
 */
export const WINDOW_BLOCKS = 167_000n

/**
 * The largest span the endpoint answers, measured rather than assumed: 167,000 and 50,000 are both
 * refused with `-32012 requested range too large`, 20,000 is answered. A single window-wide query
 * therefore fails every retry and leaves the panel reading for ever — which is how the first
 * deployment of this page behaved.
 */
const PAGE = 20_000n

type Log = { topics: string[]; data: string; blockNumber: string }

const sweep = async (
  address: string,
  topics: Array<string | string[] | null>,
  from: bigint,
  to: bigint,
): Promise<Log[]> => {
  const found: Log[] = []
  for (let at = from; at <= to; at += PAGE) {
    const end = at + PAGE - 1n > to ? to : at + PAGE - 1n
    found.push(
      ...((await logs({
        address,
        topics,
        fromBlock: `0x${at.toString(16)}`,
        toBlock: `0x${end.toString(16)}`,
      })) as unknown as Log[]),
    )
    // Spacing for the visitor as much as for this page: it competes with everything else asking
    // the same public endpoint.
    if (end < to) await pause(300)
  }
  return found
}

export const readSeries = async (submitter: string): Promise<Row[]> => {
  const head = BigInt((await call('eth_blockNumber', [])) as string)
  const from = head > WINDOW_BLOCKS ? head - WINDOW_BLOCKS : 0n

  const submitted = await sweep(INBOX, [TOPICS.claimSubmitted, null, padded(submitter)], from, head)

  // Only from the first attempt found, not from the top of the window. The verdicts cannot precede
  // the submissions they answer, so anything earlier is pages spent to read nothing.
  const earliest = submitted.reduce(
    (lowest, log) => (BigInt(log.blockNumber) < lowest ? BigInt(log.blockNumber) : lowest),
    head,
  )
  await pause(300)
  const refused = await sweep(REGISTRY, [TOPICS.submissionRejected], earliest, head)

  return joinSeries(
    submitted.map((log) => ({ submissionId: log.topics[1] as string, blockNumber: BigInt(log.blockNumber) })),
    refused.map((log) => ({
      submissionId: log.topics[1] as string,
      reason: Number(BigInt(log.data)),
      blockNumber: BigInt(log.blockNumber),
    })),
  )
}
