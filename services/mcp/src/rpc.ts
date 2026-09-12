import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem'
import type { Hex } from 'viem'
import { type Lien, deployments } from 'caplane-sdk'

export const RPC_URL = process.env.ARC_TESTNET_RPC_URL ?? 'https://rpc.testnet.arc.io'

/**
 * Measured: forty concurrent calls to this endpoint split twenty/twenty between 200 and 429, and
 * the 429 carries no Retry-After. A public, authless surface cannot let an agent's enthusiasm
 * become an outage, so outbound work is capped here rather than hoped about.
 */
const MAX_IN_FLIGHT = 8
let inFlight = 0
let served = 0

/** How many requests this process has sent. Counted so a test can pin that a read is one batch. */
export const requests = (): number => served

const READS = parseAbi([
  'function isEncumbered(bytes32 lienId) view returns (bool)',
  'function statusOf(bytes32 lienId) view returns (uint8)',
  'function lienOf(bytes32 lienId) view returns (address borrower, uint32 rateBps, uint64 createdAt, uint128 advanceUsdc6, uint64 expiresAt, uint8 status, bytes32 submissionId)',
])

export type Receipt = {
  endpoint: string
  blockNumber: Hex
  to: Hex
  calls: Array<{ name: string; data: Hex; result: Hex }>
}

export type Reading = { lien: Lien; status: number; encumbered: boolean; receipt: Receipt }

const gate = async <T>(work: () => Promise<T>): Promise<T> => {
  while (inFlight >= MAX_IN_FLIGHT) await new Promise((resolve) => setTimeout(resolve, 25))
  inFlight += 1
  served += 1
  try {
    return await work()
  } finally {
    inFlight -= 1
  }
}

const post = <T>(body: unknown): Promise<T> =>
  gate(async () => {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`rpc transport ${response.status}`)
    return (await response.json()) as T
  })

/**
 * Reads one lien three ways, in a single request pinned to a single height, and keeps the receipt.
 *
 * The height is fixed because three calls at three heights can contradict each other, and a receipt
 * naming a height that no longer answers the same thing is worse than none. The answers are matched
 * by their `id`, never by position: a batch may come back out of order and a per-member error is not
 * fatal to the batch, so position would quietly pair a status with the wrong lien.
 */
export const readLien = async (lienId: Hex): Promise<Reading> => {
  const height = await post<{ result: Hex }>({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })
  const blockNumber = height.result
  const to = deployments.registry
  const names = ['isEncumbered', 'statusOf', 'lienOf'] as const
  const calls = names.map((name, index) => ({
    id: index + 1,
    name,
    data: encodeFunctionData({ abi: READS, functionName: name, args: [lienId] }),
  }))
  const answers = await post<Array<{ id: number; result?: Hex; error?: { message: string } }>>(
    calls.map((call) => ({
      jsonrpc: '2.0',
      id: call.id,
      method: 'eth_call',
      params: [{ to, data: call.data }, blockNumber],
    })),
  )
  const resultOf = (id: number): Hex => {
    const found = answers.find((answer) => answer.id === id)
    if (found === undefined) throw new Error(`the batch did not answer call ${id}`)
    if (found.error !== undefined) throw new Error(`rpc: ${found.error.message}`)
    if (found.result === undefined) throw new Error(`call ${id} answered with no result`)
    return found.result
  }
  const raw = calls.map((call) => ({ name: call.name as string, data: call.data, result: resultOf(call.id) }))
  const [encumberedRaw, statusRaw, lienRaw] = raw
  const decoded = decodeFunctionResult({
    abi: READS,
    functionName: 'lienOf',
    data: lienRaw!.result,
  }) as readonly [Hex, number, bigint, bigint, bigint, number, Hex]
  return {
    encumbered: decodeFunctionResult({
      abi: READS,
      functionName: 'isEncumbered',
      data: encumberedRaw!.result,
    }) as boolean,
    status: decodeFunctionResult({ abi: READS, functionName: 'statusOf', data: statusRaw!.result }) as number,
    lien: {
      borrower: decoded[0],
      rateBps: decoded[1],
      createdAt: decoded[2],
      advanceUsdc6: decoded[3],
      expiresAt: decoded[4],
      status: decoded[5],
      submissionId: decoded[6],
    },
    receipt: { endpoint: RPC_URL, blockNumber, to, calls: raw },
  }
}
