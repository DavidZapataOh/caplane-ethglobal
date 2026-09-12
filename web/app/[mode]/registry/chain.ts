/**
 * Reads the lien registry straight from the visitor's browser.
 *
 * No chain library. Measured on this page, viem costs about 49 KB gzipped — 17.9 KB of it elliptic
 * curves, on a surface that never signs anything — against 552 bytes for three fixed selectors and
 * seven static-width words. The library remains the implementation of record: a test compares this
 * decode against it, field by field, against the live chain, and if they ever disagree the library
 * wins.
 *
 * The endpoint is public and needs no credential. Measured: all three public Arc endpoints send CORS
 * headers and reflect the requesting origin, so a browser can read the chain with nothing of ours in
 * the path. Never ask for credentials — these endpoints reflect the origin and do not advertise
 * `access-control-allow-credentials`, so the request would die before it left.
 */
export const REGISTRY = '0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b' as const

const ENDPOINT = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? 'https://rpc.testnet.arc.io'

/**
 * Written literally, and pinned by a test that derives them. A four-byte selector transcribed wrong
 * fails the way a thirty-two-byte one does: the call returns empty bytes, they decode to zero, and
 * the page reports "no record" about a lien that exists.
 */
export const SELECTORS = {
  isEncumbered: '0x55838ed1',
  statusOf: '0xc7df14e2',
  lienOf: '0x66999028',
} as const

export type Lien = {
  borrower: string
  rateBps: number
  createdAt: bigint
  advanceUsdc6: bigint
  expiresAt: bigint
  status: number
  submissionId: string
}

export type Receipt = {
  endpoint: string
  to: string
  blockNumber: string
  calls: Array<{ name: string; data: string; result: string }>
}

export type Reading = { status: number; encumbered: boolean; lien: Lien; receipt: Receipt }

const word = (hex: string, index: number) => hex.slice(2 + index * 64, 2 + (index + 1) * 64)
const big = (hex: string, index: number) => BigInt(`0x${word(hex, index) || '0'}`)

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Retried, because the endpoint rate-limits. Measured: `-32005 rate limit exceeded` arrives under a
 * burst no larger than a page load and a sweep together, and a read that gave up on the first
 * refusal would tell a visitor there is no record about a lien that exists.
 */
const rpc = async <T>(body: unknown): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error(`the endpoint answered ${response.status}`)
      const answer = (await response.json()) as T & { error?: { message: string } }
      if (!Array.isArray(answer) && answer.error !== undefined) throw new Error(answer.error.message)
      return answer as T
    } catch (error) {
      if (attempt === 4) throw error
      await pause(400 * 2 ** attempt)
    }
  }
}

/** One box, two questions. A 32-byte value is a lien id; a 20-byte value is a borrower. */
export const classify = (input: string): 'lien' | 'borrower' | 'invalid' => {
  const trimmed = input.trim().toLowerCase()
  if (/^0x[0-9a-f]{64}$/.test(trimmed)) return 'lien'
  if (/^0x[0-9a-f]{40}$/.test(trimmed)) return 'borrower'
  return 'invalid'
}

export const normalise = (input: string): string => input.trim().toLowerCase()

/**
 * The three reads, in one request, pinned to one height.
 *
 * Three calls at three heights can contradict each other, and a receipt naming a height that no
 * longer answers the same thing is worse than no receipt. The answers are matched by their `id` and
 * never by position: a batch may come back out of order, and position would pair a status with the
 * wrong lien in silence.
 */
export const read = async (lienId: string): Promise<Reading> => {
  const id = normalise(lienId)
  const height = await rpc<{ result: string }>({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })
  const blockNumber = height.result
  const names = ['isEncumbered', 'statusOf', 'lienOf'] as const
  const calls = names.map((name, index) => ({
    id: index + 1,
    name,
    data: `${SELECTORS[name]}${id.slice(2)}`,
  }))
  const answers = await rpc<Array<{ id: number; result?: string; error?: { message: string } }>>(
    calls.map((call) => ({
      jsonrpc: '2.0',
      id: call.id,
      method: 'eth_call',
      params: [{ to: REGISTRY, data: call.data }, blockNumber],
    })),
  )
  const resultOf = (callId: number) => {
    const found = answers.find((answer) => answer.id === callId)
    if (found === undefined) throw new Error('the endpoint did not answer every call')
    if (found.error !== undefined) throw new Error(found.error.message)
    return found.result ?? '0x'
  }
  const raw = calls.map((call) => ({ name: call.name as string, data: call.data, result: resultOf(call.id) }))
  const lienRaw = raw[2]!.result
  return {
    encumbered: big(raw[0]!.result, 0) === 1n,
    status: Number(big(raw[1]!.result, 0)),
    lien: {
      borrower: `0x${word(lienRaw, 0).slice(24)}`,
      rateBps: Number(big(lienRaw, 1)),
      createdAt: big(lienRaw, 2),
      advanceUsdc6: big(lienRaw, 3),
      expiresAt: big(lienRaw, 4),
      status: Number(big(lienRaw, 5)),
      submissionId: `0x${word(lienRaw, 6)}`,
    },
    receipt: { endpoint: ENDPOINT, to: REGISTRY, blockNumber, calls: raw },
  }
}
