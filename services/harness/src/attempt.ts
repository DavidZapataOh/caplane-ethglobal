import { createWalletClient, defineChain, encodeFunctionData, http, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { buildEnvelope } from '../../../claim/seal.ts'
import { CHAIN_ID, ENCLAVE_PUBLIC_KEY, INBOX, RPC_URL, submissionIdOf } from './chain.ts'
import type { Hex } from './classify.ts'
import type { Target } from './target.ts'

const arc = defineChain({
  id: CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
})

const INBOX_ABI = [
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

/**
 * One attempt: seal the same claim again, and send it.
 *
 * Sealed fresh every time rather than replayed. The submission id is `keccak256(sender ‖ ciphertext)`
 * and the inbox refuses an id it has already seen, so identical bytes would revert — but the
 * envelope carries a random ephemeral key and nonce, so re-sealing one claim produces different
 * bytes and a different id. The claim being attempted is identical; only its wrapping is not.
 */
export const attempt = async (target: Target): Promise<{ submissionId: Hex; hash: Hex }> => {
  const secret = process.env.HARNESS_SIGNER_SECRET
  if (secret === undefined || secret === '') throw new Error('HARNESS_SIGNER_SECRET is not set')
  const account = privateKeyToAccount(secret as Hex)
  const wallet = createWalletClient({ account, chain: arc, transport: http(RPC_URL) })

  const envelope = buildEnvelope(
    target.claim,
    target.confirmation,
    target.signature,
    account.address,
    ENCLAVE_PUBLIC_KEY,
  )
  const ciphertext = toHex(envelope)
  const submissionId = submissionIdOf(account.address, ciphertext)
  const hash = await wallet.sendTransaction({
    to: INBOX,
    data: encodeFunctionData({ abi: INBOX_ABI, functionName: 'submit', args: [submissionId, ciphertext] }),
  })
  return { submissionId, hash }
}
