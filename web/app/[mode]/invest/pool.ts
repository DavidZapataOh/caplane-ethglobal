// web/app/[mode]/invest/pool.ts
export const POOL = '0x4df4c8d722b3a9ebd18b9094c883b5ff83565d7c' as const
const CHAIN_USDC = '0x3600000000000000000000000000000000000000' as const
const ENDPOINT = process.env.NEXT_PUBLIC_ARC_RPC_URL ?? 'https://rpc.testnet.arc.io'

export type Address = `0x${string}`
export type Hex = `0x${string}`

/** Pinned by a test that derives each one from its real signature with viem. */
export const SELECTORS = {
  deposit: '0x6e553f65',
  redeem: '0xba087652',
  approve: '0x095ea7b3',
  allowance: '0xdd62ed3e',
  balanceOf: '0x70a08231',
  totalAssets: '0x01e1d114',
  decimals: '0x313ce567',
  convertToAssets: '0x07a2d13a',
  maxRedeem: '0xd905777e',
  outstandingPrincipal: '0x29b1829e',
} as const

const pad32 = (hex: string): string => hex.replace(/^0x/, '').padStart(64, '0')
const padAddress = (address: Address): string => pad32(address.toLowerCase())
const padUint = (value: bigint): string => pad32(value.toString(16))
const word = (hex: string, index: number) => hex.slice(2 + index * 64, 2 + (index + 1) * 64)
const big = (hex: string, index = 0) => BigInt(`0x${word(hex, index) || '0'}`)

const rpc = async <T>(body: unknown): Promise<T> => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`the endpoint answered ${response.status}`)
  const answer = (await response.json()) as T & { error?: { message: string } }
  if (!Array.isArray(answer) && answer.error !== undefined) throw new Error(answer.error.message)
  return answer as T
}

const call = async (to: Address, data: Hex): Promise<string> => {
  const answer = await rpc<{ result?: string; error?: { message: string } }>({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
  })
  return answer.result ?? '0x'
}

export const encodeApprove = (amount: bigint): Hex =>
  `${SELECTORS.approve}${padAddress(POOL)}${padUint(amount)}` as Hex

export const encodeDeposit = (assets: bigint, receiver: Address): Hex =>
  `${SELECTORS.deposit}${padUint(assets)}${padAddress(receiver)}` as Hex

export const encodeRedeem = (shares: bigint, receiver: Address, owner: Address): Hex =>
  `${SELECTORS.redeem}${padUint(shares)}${padAddress(receiver)}${padAddress(owner)}` as Hex

export type Position = {
  shares: bigint
  valueAssets: bigint
  redeemableAssets: bigint
  poolTvlAssets: bigint
  outstandingPrincipal: bigint
  decimals: number
}

/** Every field the console shows, in one batch pinned to the same behaviour `chain.ts` follows: one
 * request, answers matched by id, never by position. */
export const readPosition = async (investor: Address): Promise<Position> => {
  const calls = [
    { id: 1, to: POOL, data: `${SELECTORS.balanceOf}${padAddress(investor)}` as Hex },
    { id: 2, to: POOL, data: `${SELECTORS.totalAssets}` as Hex },
    { id: 3, to: POOL, data: `${SELECTORS.decimals}` as Hex },
    { id: 4, to: POOL, data: `${SELECTORS.maxRedeem}${padAddress(investor)}` as Hex },
    { id: 5, to: POOL, data: `${SELECTORS.outstandingPrincipal}` as Hex },
  ]
  const answers = await rpc<Array<{ id: number; result?: string; error?: { message: string } }>>(
    calls.map((c) => ({ jsonrpc: '2.0', id: c.id, method: 'eth_call', params: [{ to: c.to, data: c.data }, 'latest'] })),
  )
  const resultOf = (id: number) => {
    const found = answers.find((a) => a.id === id)
    if (found === undefined) throw new Error('the endpoint did not answer every call')
    if (found.error !== undefined) throw new Error(found.error.message)
    return found.result ?? '0x'
  }
  const shares = big(resultOf(1))
  const totalAssets = big(resultOf(2))
  const decimals = Number(big(resultOf(3)))
  const maxRedeemShares = big(resultOf(4))
  const outstandingPrincipal = big(resultOf(5))

  const convertToAssets = async (s: bigint) =>
    big(await call(POOL, `${SELECTORS.convertToAssets}${padUint(s)}` as Hex))

  return {
    shares,
    valueAssets: await convertToAssets(shares),
    redeemableAssets: await convertToAssets(maxRedeemShares),
    poolTvlAssets: totalAssets,
    outstandingPrincipal,
    decimals,
  }
}

export const readAllowance = async (owner: Address): Promise<bigint> =>
  big(await call(CHAIN_USDC, `${SELECTORS.allowance}${padAddress(owner)}${padAddress(POOL)}` as Hex))

export const nextDepositStep = (allowance: bigint, requested: bigint): 'approve' | 'deposit' =>
  allowance >= requested ? 'deposit' : 'approve'

export const validateRedeem = (requested: bigint, max: bigint): string | undefined =>
  requested > max ? `Up to ${formatUsdc(max)} is available right now — the rest is out on active advances.` : undefined

export const formatUsdc = (raw: bigint): string => `${(Number(raw) / 1e6).toFixed(6)} USDC`

export const formatShares = (raw: bigint, decimals: number): string =>
  `${(Number(raw) / 10 ** decimals).toFixed(decimals)} cpUSDC`
