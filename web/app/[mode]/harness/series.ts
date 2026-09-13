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

const logs = async (params: Record<string, unknown>): Promise<Array<Record<string, never>>> => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [params] }),
  })
  const body = (await response.json()) as { result?: unknown; error?: { message: string } }
  if (body.error !== undefined) throw new Error(body.error.message)
  return (body.result ?? []) as Array<Record<string, never>>
}

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

export const readSeries = async (submitter: string): Promise<Row[]> => {
  const head = BigInt(
    (await (
      await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      })
    ).json().then((b: { result: string }) => b.result)) as string,
  )
  const from = `0x${(head > WINDOW_BLOCKS ? head - WINDOW_BLOCKS : 0n).toString(16)}`

  const submitted = (await logs({
    address: INBOX,
    fromBlock: from,
    toBlock: 'latest',
    topics: [TOPICS.claimSubmitted, null, padded(submitter)],
  })) as unknown as Array<{ topics: string[]; blockNumber: string }>

  const refused = (await logs({
    address: REGISTRY,
    fromBlock: from,
    toBlock: 'latest',
    topics: [TOPICS.submissionRejected],
  })) as unknown as Array<{ topics: string[]; data: string; blockNumber: string }>

  return joinSeries(
    submitted.map((log) => ({ submissionId: log.topics[1] as string, blockNumber: BigInt(log.blockNumber) })),
    refused.map((log) => ({
      submissionId: log.topics[1] as string,
      reason: Number(BigInt(log.data)),
      blockNumber: BigInt(log.blockNumber),
    })),
  )
}
