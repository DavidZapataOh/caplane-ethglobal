import { encodePacked, keccak256, toHex } from 'viem'
import type { Hex } from './classify.ts'
import book from '../abi/deployments.arc-testnet.json' with { type: 'json' }

export const REGISTRY = book.registry as Hex
export const INBOX = book.inbox as Hex
export const ENCLAVE_PUBLIC_KEY = book.enclavePublicKey as Hex
export const CHAIN_ID = book.chainId as number
export const RPC_URL = process.env.ARC_TESTNET_RPC_URL ?? 'https://rpc.testnet.arc.io'

/**
 * Transcribed rather than derived, and the same four bytes the public lookup uses. A selector
 * written wrong does not fail: the call returns empty bytes, they decode to zero, and a live lien
 * reads as absent — which here would turn every bounce into an undecidable.
 */
export const SELECTORS = {
  statusOf: '0xc7df14e2',
  workflowName: '0x007271ce',
} as const

export const TOPICS = {
  submissionRejected: keccak256(toHex('SubmissionRejected(bytes32,uint8)')),
  lienRecorded: keccak256(toHex('LienRecorded(bytes32,address,uint64)')),
} as const

export const submissionIdOf = (submitter: Hex, ciphertext: Hex): Hex =>
  keccak256(encodePacked(['address', 'bytes'], [submitter, ciphertext]))

type RpcError = { code: number; message: string }

/**
 * One JSON-RPC call, with the failure surfaced rather than swallowed.
 *
 * The public endpoint rate-limits, and a read that quietly returned a zero would be read by this
 * worker as "the target is no longer encumbered" — a true-looking statement about the registry
 * derived from a fact about the network. Every caller here has to be able to tell the two apart,
 * so nothing is defaulted.
 */
export const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) throw new Error(`rpc ${method} http ${response.status}`)
  const body = (await response.json()) as { result?: unknown; error?: RpcError }
  if (body.error !== undefined) throw new Error(`rpc ${method} ${body.error.message}`)
  return body.result
}

const call = async (to: Hex, data: string): Promise<string> =>
  (await rpc('eth_call', [{ to, data }, 'latest'])) as string

/** The registry's own state for a lien. Undefined when the endpoint would not answer. */
export const statusOf = async (lienId: Hex): Promise<number | undefined> => {
  try {
    const answer = await call(REGISTRY, `${SELECTORS.statusOf}${lienId.slice(2)}`)
    return Number(BigInt(answer))
  } catch {
    return undefined
  }
}

/**
 * Whether the registry is answering for itself at all.
 *
 * This is the discriminator the whole run rests on. The enclave sends an unreadable registry into
 * the same refusal code as a real collision, so without a separate reading of "the registry is up"
 * this worker would count an outage as a proof.
 */
export const registryAnswers = async (): Promise<boolean> => {
  try {
    const answer = await call(REGISTRY, SELECTORS.workflowName)
    return answer !== '0x' && BigInt(answer) !== 0n
  } catch {
    return false
  }
}
