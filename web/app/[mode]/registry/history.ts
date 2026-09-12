import { REGISTRY } from './chain.ts'

const ENDPOINT = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? 'https://rpc.testnet.arc.io'

export const DEPLOYED_AT = 61_681_981n
/** The endpoint declares its own cap: `eth_getLogs is limited to a 10,000 range`. */
const PAGE = 10_000n

/** Written literally and pinned by a test that derives them. A transcribed topic matches nothing. */
export const TOPICS = {
  LienRecorded: '0xa056ef83cdf84a7035835560d978b378fae112dc9bf3dae8be9677d7d94b0d58',
  LienReleased: '0x5c70e2ededfc3ad5af19353db18d16af6782b5e788d30f36e73646c493094071',
  SubmissionRejected: '0x962951bdec41590ba264b9fbb9d3d88d92884bfced23604ae728204e68ef8760',
} as const

export type Log = { topics: string[]; data: string; blockNumber: string }

export type FetchLogs = (filter: Record<string, unknown>) => Promise<Log[]>

const live: FetchLogs = async (filter) => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [filter] }),
  })
  if (!response.ok) throw new Error(`the endpoint answered ${response.status}`)
  const body = (await response.json()) as { result?: Log[]; error?: { message: string } }
  if (body.error !== undefined) throw new Error(body.error.message)
  return body.result ?? []
}

const head = async (): Promise<bigint> => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
  })
  const body = (await response.json()) as { result: string }
  return BigInt(body.result)
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Paced and retried, because the endpoint rate-limits and a sweep is a burst by nature.
 *
 * Measured while building this: eight pages of a topic-filtered sweep is enough to earn `-32005
 * rate limit exceeded`, and a page that answered that and was not retried would leave a visitor
 * with "no record" about a lien that exists. The pages are sequential, spaced, and retried; a
 * rejection that never clears is raised, never turned into an empty result.
 */
const sweep = async (topics: Array<string | string[] | null>, fetchLogs: FetchLogs): Promise<Log[]> => {
  const to = await head()
  const found: Log[] = []
  for (let at = DEPLOYED_AT; at <= to; at += PAGE) {
    const end = at + PAGE - 1n > to ? to : at + PAGE - 1n
    const filter = {
      address: REGISTRY,
      topics,
      fromBlock: `0x${at.toString(16)}`,
      toBlock: `0x${end.toString(16)}`,
    }
    for (let attempt = 0; ; attempt += 1) {
      try {
        found.push(...(await fetchLogs(filter)))
        break
      } catch (error) {
        if (attempt === 4) throw error
        await pause(400 * 2 ** attempt)
      }
    }
    await pause(120)
  }
  return found
}

export type Recorded = { lienId: string; borrower: string; expiresAt: bigint; blockNumber: bigint }

/**
 * Everything recorded for one borrower, from the deployment block.
 *
 * A failure propagates. It must never become an empty list: an empty list is what a lender reads as
 * "nothing pledged", and the endpoint refuses a legal range under load — measured, `-32012` twelve
 * times running — and answers `4444 pruned history unavailable` for a span it no longer keeps.
 */
export const liensOf = async (borrower: string, fetchLogs: FetchLogs = live): Promise<Recorded[]> => {
  const padded = `0x${borrower.toLowerCase().slice(2).padStart(64, '0')}`
  const logs = await sweep([TOPICS.LienRecorded, null, padded], fetchLogs)
  return logs.map((log) => ({
    lienId: log.topics[1] ?? '0x',
    borrower: borrower.toLowerCase(),
    expiresAt: BigInt(log.data === '0x' ? '0x0' : log.data),
    blockNumber: BigInt(log.blockNumber),
  }))
}

/**
 * Why an id reads empty.
 *
 * Measured: `lienOf` returns seven zero words both for a submission the enclave refused and for an
 * id the registry never saw. The contract cannot tell those apart — only the logs can — and calling
 * a refusal "not found" hides the most interesting thing the registry has to say.
 *
 * Undefined means the log read itself failed. The caller shows the status without a reason rather
 * than inventing one: the main question was already answered by the call, and spoiling that answer
 * with the failure of an accessory read would make the page worse by completing it.
 */
export const explain = async (
  lienId: string,
  fetchLogs: FetchLogs = live,
): Promise<`rejected:${number}` | 'released' | 'unknown' | undefined> => {
  const id = lienId.toLowerCase()
  try {
    // One sweep, not two. `topics[0]` accepts a list of alternatives, so both events come back from
    // the same pass — half the requests against an endpoint that rate-limits, and the correct use of
    // the filter rather than a convenience.
    const logs = await sweep([[TOPICS.SubmissionRejected, TOPICS.LienReleased], id], fetchLogs)
    const refusal = logs.filter((log) => log.topics[0] === TOPICS.SubmissionRejected).pop()
    if (refusal !== undefined) return `rejected:${Number(BigInt(refusal.data))}`
    if (logs.some((log) => log.topics[0] === TOPICS.LienReleased)) return 'released'
    return 'unknown'
  } catch {
    return undefined
  }
}
