import { parseAbiItem, type Address, type PublicClient } from 'viem'
import type { CaplaneClient } from './client.js'

const LIEN_RECORDED = parseAbiItem(
  'event LienRecorded(bytes32 indexed lienId, address indexed borrower, uint64 expiresAt)',
)

/** The endpoint refuses a wider span: `-32614 eth_getLogs is limited to a 10,000 range`. */
export const MAX_SPAN = 10_000n

/**
 * Where the registry was deployed. The default has to start here and not at a window off the head:
 * at roughly half a second a block, ten thousand blocks is eighty-six minutes, so a head-relative
 * default would return an empty list for anything older — and a lender reads an empty list as
 * nothing pledged.
 */
export const DEPLOYED_AT = 61_681_981n

/**
 * Retries a rejected page instead of losing the scan.
 *
 * Measured against the live endpoint: an identical, legal 8,792-block query was refused twelve
 * times running over twenty seconds with `-32012 requested range too large`, then answered six for
 * six. That is the node shedding load, not a verdict about the range, so there is no page size that
 * avoids it. The same backoff covers `-32005 rate limit exceeded`, which a seven-page scan reaches
 * if two of them run at once. A rejection that never clears is still raised.
 */
export const withRetry = async <T>(ask: () => Promise<T>, baseDelayMs = 1_000): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await ask()
    } catch (error) {
      if (attempt === 5) throw error
      if (baseDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt))
      }
    }
  }
}

export type RecordedLien = {
  lienId: `0x${string}`
  borrower: Address
  expiresAt: bigint
  blockNumber: bigint
}

const scan = async (
  endpoint: PublicClient,
  registry: Address,
  borrower: Address,
  from: bigint,
  head: bigint,
): Promise<RecordedLien[]> => {
  const found: RecordedLien[] = []
  for (let at = from; at <= head; at = at + MAX_SPAN) {
    const to = at + MAX_SPAN - 1n > head ? head : at + MAX_SPAN - 1n
    const logs = await withRetry(() =>
      endpoint.getLogs({
        address: registry,
        event: LIEN_RECORDED,
        args: { borrower },
        fromBlock: at,
        toBlock: to,
      }),
    )
    for (const log of logs) {
      found.push({
        lienId: log.args.lienId as `0x${string}`,
        borrower: log.args.borrower as Address,
        expiresAt: log.args.expiresAt as bigint,
        blockNumber: log.blockNumber,
      })
    }
  }
  return found
}

/**
 * Every lien ever recorded for one borrower.
 *
 * This is the only question a third party can ask without having been handed a lien id first, and
 * it is why the package is useful to a lender who was given nothing: it answers how much a
 * counterparty has already pledged and until when. It does NOT answer whether one particular
 * receivable is pledged — that needs a lien id, and a lien id comes from the enclave.
 *
 * ⚠️ Unlike the point reads, this runs against ONE endpoint, and that is a measured concession
 * rather than an oversight. The two default endpoints do not share a log-range limit: the first
 * caps a query at ten thousand blocks and says so, while the second caps it near a hundred while
 * reporting `ranges over 10000 blocks are not supported` — measured, it refuses two thousand and
 * accepts one hundred. A quorum scan from the deployment block would therefore need about seven
 * hundred requests per endpoint against a rate limiter, to compare a list it would rarely finish
 * assembling.
 *
 * What that costs is stated in the README: an endpoint that omitted a `LienRecorded` would show a
 * lender less pledged than there is. A caller who minds should pass their own node.
 */
export const liensOf = async (
  client: CaplaneClient,
  borrower: Address,
  options: { fromBlock?: bigint } = {},
): Promise<RecordedLien[]> => {
  const head = await client.read.getBlockNumber()
  const from = options.fromBlock ?? DEPLOYED_AT
  return scan(client.read, client.registry, borrower, from, head)
}
