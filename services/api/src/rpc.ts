import type { Hex } from 'viem'

export const RPC_URL = process.env.ARC_TESTNET_RPC_URL ?? 'https://rpc.testnet.arc.io'

/** What to do about a rejection. Only one of the five is a verdict about the declared range. */
export type RpcFailure = 'split' | 'narrow' | 'retry' | 'clamp' | 'fatal'

export class RpcError extends Error {
  override readonly name = 'RpcError'
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

const RETRY_RANGE = /retry with the range (\d+)-(\d+)/

/**
 * Measured against the live endpoint, which refuses in five distinguishable ways:
 *
 *   -32614  eth_getLogs is limited to a 10,000 range        the declared span is too wide
 *   -32602  query exceeds max results 20000, retry with…    too many results, and it names the range
 *   -32012  requested range too large                       transient load shedding
 *   -32005  rate limit exceeded                             a burst
 *   -32014  requested data not available                    toBlock is past the head
 *
 * And a sixth that is not JSON-RPC at all: an HTTP 429 with no body, which the transport surfaces
 * with the status as the code.
 *
 * `-32012` is not a verdict about the range: the identical 8,792-block query was refused twelve
 * times running over twenty seconds and then answered six for six. `-32014` is the opposite —
 * retrying it never succeeds. Treating any of them as an empty page buries a gap for good.
 */
export const classify = (error: {
  code: number
  message: string
}): { kind: RpcFailure; hint?: { from: bigint; to: bigint } } => {
  if (error.code === -32614) return { kind: 'split' }
  if (error.code === -32014) return { kind: 'clamp' }
  if (error.code === -32012 || error.code === -32005) return { kind: 'retry' }
  // Measured: the endpoint also sheds load at the transport layer, with an HTTP 429 and no
  // JSON-RPC body at all. Read as `fatal` it stops the index dead on a burst, which is the one
  // failure that looks permanent and is not.
  if (error.code === 429 || error.code === 502 || error.code === 503 || error.code === 504) {
    return { kind: 'retry' }
  }
  if (error.code === -32602) {
    const found = RETRY_RANGE.exec(error.message)
    const from = found?.[1]
    const to = found?.[2]
    if (from === undefined || to === undefined) return { kind: 'split' }
    return { kind: 'narrow', hint: { from: BigInt(from), to: BigInt(to) } }
  }
  return { kind: 'fatal' }
}

const call = async <T>(method: string, params: unknown[]): Promise<T> => {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) throw new RpcError(response.status, `transport ${response.status}`)
  const body = (await response.json()) as { result?: T; error?: { code: number; message: string } }
  if (body.error !== undefined) throw new RpcError(body.error.code, body.error.message)
  return body.result as T
}

export const blockNumber = async (): Promise<bigint> => BigInt(await call<Hex>('eth_blockNumber', []))

export type Log = {
  address: Hex
  topics: Hex[]
  data: Hex
  blockNumber: Hex
  logIndex: Hex
  transactionHash: Hex
}

/**
 * The height is written as a number, never as `latest`. The enclave's own reader already recorded
 * why it pins a block; here there is a second, measured reason: with `toBlock: "latest"` the
 * endpoint answered `-32012` ten times running on a span it accepted with the same number in hex.
 */
export const getLogs = (options: {
  fromBlock: bigint
  toBlock: bigint
  addresses: readonly Hex[]
}): Promise<Log[]> =>
  call<Log[]>('eth_getLogs', [
    {
      fromBlock: `0x${options.fromBlock.toString(16)}`,
      toBlock: `0x${options.toBlock.toString(16)}`,
      ...(options.addresses.length > 0 ? { address: options.addresses } : {}),
    },
  ])
