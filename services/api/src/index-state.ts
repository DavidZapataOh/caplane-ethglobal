import type { Hex } from 'viem'
import book from '../abi/deployments.arc-testnet.json' with { type: 'json' }
import { type ActivityEvent, decode } from './events.js'
import { type Log, RpcError, blockNumber, classify, getLogs } from './rpc.js'

export const DEPLOYED_AT = 61_681_981n
export const MAX_EVENTS = 2_000
const PAGE = 10_000n
const STALE_AFTER_MS = 60_000
/**
 * A backfill from the deployment block is eight pages, which is a burst against an endpoint
 * measured to shed load at `-32005` and at a transport-level 429. The spacing is for a cold restart
 * as much as for the suite: a restart replays the whole range, and a page that gave up would leave
 * the feed quietly short with the service still answering 200.
 */
const PAUSE_MS = 400
const RETRY_DELAY_MS = 2_500

export const ADDRESSES: readonly Hex[] = [
  book.registry as Hex,
  book.inbox as Hex,
  book.pool as Hex,
  book.escrow as Hex,
]

export type Snapshot = {
  chainId: number
  addresses: readonly Hex[]
  deployedAt: bigint
  indexedThrough: bigint
  head: bigint
  lagBlocks: number
  stale: boolean
  truncated: boolean
  events: ActivityEvent[]
}

export const createIndex = (
  options: {
    fetchPage?: (from: bigint, to: bigint) => Promise<Log[]>
    maxEvents?: number
    staleAfterMs?: number
    pauseMs?: number
    retryDelayMs?: number
  } = {},
) => {
  const fetchPage =
    options.fetchPage ?? ((from, to) => getLogs({ fromBlock: from, toBlock: to, addresses: ADDRESSES }))
  const maxEvents = options.maxEvents ?? MAX_EVENTS
  const staleAfterMs = options.staleAfterMs ?? STALE_AFTER_MS
  const pauseMs = options.pauseMs ?? PAUSE_MS
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS

  let cursor = DEPLOYED_AT - 1n
  let head = DEPLOYED_AT
  let advancedAt = Date.now()
  let truncated = false
  const events: ActivityEvent[] = []

  const absorb = (incoming: readonly ActivityEvent[]) => {
    events.unshift(...incoming)
    if (events.length > maxEvents) {
      events.length = maxEvents
      truncated = true
    }
  }

  const pause = (ms: number) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : undefined)

  const walk = async (to: bigint) => {
    let at = cursor + 1n
    let span = PAGE
    let ceiling = to
    let refusals = 0
    while (at <= ceiling) {
      const end = at + span - 1n > ceiling ? ceiling : at + span - 1n
      try {
        const page = await fetchPage(at, end)
        absorb(
          page
            .map(decode)
            .filter((event): event is ActivityEvent => event !== undefined)
            .reverse(),
        )
        // The cursor moves only on an answer. Moving it on a rejection buries the gap for good,
        // and nothing downstream can tell a short feed from a quiet one.
        cursor = end
        advancedAt = Date.now()
        at = end + 1n
        span = PAGE
        refusals = 0
        await pause(pauseMs)
        continue
      } catch (error) {
        if (!(error instanceof RpcError) && !(error as { code?: number }).code) throw error
        refusals += 1
        if (refusals > 9) throw error
        const seen = classify(error as { code: number; message: string })
        if (seen.kind === 'narrow' && seen.hint !== undefined) {
          span = seen.hint.to - seen.hint.from + 1n
          continue
        }
        if (seen.kind === 'split') {
          span = span > 1n ? span / 2n : 1n
          continue
        }
        if (seen.kind === 'clamp') {
          ceiling = await blockNumber()
          continue
        }
        if (seen.kind === 'retry') {
          await pause(retryDelayMs)
          continue
        }
        throw error
      }
    }
  }

  return {
    absorb,
    backfill: async (until?: bigint) => {
      head = until ?? (await blockNumber())
      await walk(head)
    },
    snapshot: (): Snapshot => ({
      chainId: book.chainId,
      addresses: ADDRESSES,
      deployedAt: DEPLOYED_AT,
      indexedThrough: cursor,
      head,
      lagBlocks: Number(head - cursor),
      stale: Date.now() - advancedAt >= staleAfterMs,
      truncated,
      events: [...events],
    }),
  }
}

export type Index = ReturnType<typeof createIndex>
