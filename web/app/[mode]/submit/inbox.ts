import { type Hex, encodePacked, keccak256 } from 'viem'
import deployments from '../../../../contracts/abi/deployments.arc-testnet.json' with { type: 'json' }

export const INBOX = deployments.inbox as Hex

export const ARC = {
  chainIdHex: '0x4cef52',
  enclavePublicKey: deployments.enclavePublicKey as Hex,
} as const

/**
 * The inbox refuses any submission whose first argument is not exactly this hash, so deriving it
 * another way is a transaction that costs gas and reverts. Packed, not standard-encoded: the
 * contract uses `abi.encodePacked`, and the two disagree on everything but the simplest cases.
 */
export const submissionIdOf = (sender: Hex, ciphertext: Hex): Hex =>
  keccak256(encodePacked(['address', 'bytes'], [sender, ciphertext]))

/** The one function that writes. Vendored shape, matching the frozen ABI. */
export const inboxAbi = [
  {
    type: 'function',
    name: 'submit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'submissionId', type: 'bytes32' },
      { name: 'ciphertext', type: 'bytes' },
    ],
    outputs: [],
  },
] as const

/** The confirmation service. Holds the debtor's signature and nothing of the claim itself. */
export const API = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.caplane.xyz'

export const REGISTRY = deployments.registry as Hex

/** Arc's own endpoint, which needs no credential — the same one the public registry reads from. */
export const rpc = async (method: string, params: unknown[]): Promise<unknown> => {
  const response = await fetch(process.env.NEXT_PUBLIC_ARC_RPC_URL ?? 'https://rpc.testnet.arc.io', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = (await response.json()) as { result?: unknown; error?: { message: string } }
  if (body.error !== undefined) throw new Error(body.error.message)
  return body.result
}
