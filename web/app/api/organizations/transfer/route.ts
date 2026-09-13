import { NextResponse } from 'next/server'
import { isPolicyViolation } from '../policy'
import { openBinding } from '../binding'
import { authenticatedUserId, privyClient, required } from '../privy'

/**
 * A treasury transfer: signed by the organization's wallet, then broadcast by us.
 *
 * `eth_signTransaction`, not `eth_sendTransaction`: for operations Privy also broadcasts, the
 * simulation runs before policy evaluation, so an unfunded wallet fails with `insufficient_funds`
 * and the policy is never consulted — the refusal would carry the wrong code and prove the wrong
 * thing. Signing is evaluated by the policy directly.
 *
 * Privy signs but does not broadcast: `eth_sendTransaction` is gated per application and per chain
 * and answers `401 App is not authorized to transact on chain eip155:5042002`, while signing is
 * not gated. So the signed transaction goes out over Arc's own public RPC, which needs no
 * credential — measured, and the path this project already uses.
 *
 * The failure is passed through with the code Privy returned, unflattened: the interface decides
 * what to say, and it can only distinguish a policy block from an empty wallet if the code
 * survives the trip.
 */
const ARC = {
  chainId: 5042002,
  /** Above Arc's base-fee floor: an underpriced transaction is dropped with no error and no receipt. */
  maxFeePerGas: '0x6fc23ac00',
  maxPriorityFeePerGas: '0x3b9aca00',
  gasLimit: '0x5208',
} as const

const RPC = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? 'https://rpc.testnet.arc.io'

const rpc = async (method: string, params: unknown[]): Promise<string> => {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = (await response.json()) as { result?: string; error?: { message: string } }
  if (body.error !== undefined) throw new Error(body.error.message)
  return body.result as string
}

export async function POST(request: Request) {
  const privy = privyClient()
  const userId = await authenticatedUserId(privy, request)
  if (userId === undefined) {
    return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401 })
  }

  const { binding, from, to, valueWei } = (await request.json()) as {
    binding?: string
    from?: string
    to?: string
    valueWei?: string
  }
  if (binding === undefined || from === undefined || to === undefined || valueWei === undefined) {
    return NextResponse.json({ error: { code: 'malformed_request' } }, { status: 400 })
  }

  // The wallet comes out of the token, never out of the body, and only for the user it was minted
  // for. Verifying the access token says someone is signed in; this says which wallet is theirs.
  const opened = openBinding(binding, required('ORG_BINDING_KEY'))
  if (opened === undefined || opened.userId !== userId) {
    return NextResponse.json({ error: { code: 'not_your_wallet' } }, { status: 403 })
  }
  const walletId = opened.walletId

  // The wallet's own count, never a literal: a fixed nonce signs fine and is rejected on
  // broadcast the second time the same wallet sends anything.
  let nonce: string
  try {
    nonce = await rpc('eth_getTransactionCount', [from, 'pending'])
  } catch (error) {
    return NextResponse.json({ rpcError: (error as Error).message }, { status: 502 })
  }

  let signedTransaction: string
  try {
    const signed = await privy
      .wallets()
      .ethereum()
      .signTransaction(walletId, {
        params: {
          transaction: {
            to,
            value: `0x${BigInt(valueWei).toString(16)}`,
            chain_id: ARC.chainId,
            type: 2,
            nonce,
            max_fee_per_gas: ARC.maxFeePerGas,
            max_priority_fee_per_gas: ARC.maxPriorityFeePerGas,
            gas_limit: ARC.gasLimit,
          },
        },
      })
    signedTransaction = signed.signed_transaction
  } catch (error) {
    const e = error as { status?: number; error?: { code?: string } }
    return NextResponse.json(
      { status: e.status, error: e.error, blockedByPolicy: isPolicyViolation(e) },
      { status: e.status ?? 500 },
    )
  }

  try {
    return NextResponse.json({ hash: await rpc('eth_sendRawTransaction', [signedTransaction]) })
  } catch (error) {
    // The chain's own words, not ours: an unfunded wallet says so more precisely than any message
    // written here could, and confusing it with the policy refusal above is the one mistake this
    // whole flow exists to avoid.
    return NextResponse.json({ rpcError: (error as Error).message }, { status: 502 })
  }
}
