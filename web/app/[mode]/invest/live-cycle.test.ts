import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  POOL,
  type Address,
  encodeApprove,
  encodeDeposit,
  encodeRedeem,
  formatShares,
  formatUsdc,
  readAllowance,
  readPosition,
} from './pool.ts'

/**
 * The cycle, against the deployed pool on Arc Testnet, with a funded wallet and real transactions.
 *
 * A console that only ever showed zeros would be indistinguishable from one that reads correctly
 * until the number it shows changes after something real happens. That change is what this
 * measures: a position before, a deposit, the same position after, and back.
 *
 * Skipped rather than failed when the key is absent: the credential belongs to a person, and a
 * contributor without it should not see a red suite for a wallet they were never given.
 */
const KEY = process.env.INVESTOR_KEY as `0x${string}` | undefined
const USDC = '0x3600000000000000000000000000000000000000' as const

const arc = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
})

const DEPOSIT = 10_000n // 0.01 USDC, six decimals

test('a deposit and a redemption move the position, both ways', { skip: KEY === undefined }, async () => {
  const account = privateKeyToAccount(KEY as `0x${string}`)
  const wallet = createWalletClient({ account, chain: arc, transport: http() })
  const me = account.address as Address

  const before = await readPosition(me)

  // Approve only when the standing allowance is short: a second deposit from the same wallet needs
  // one transaction, not two, and sending a redundant approval would spend gas to prove nothing.
  if ((await readAllowance(me)) < DEPOSIT) {
    const approval = await wallet.sendTransaction({ to: USDC, data: encodeApprove(DEPOSIT) })
    assert.ok(approval.startsWith('0x'))
    await new Promise((resolve) => setTimeout(resolve, 6_000))
  }

  const deposited = await wallet.sendTransaction({ to: POOL, data: encodeDeposit(DEPOSIT, me) })
  assert.ok(deposited.startsWith('0x'), 'the deposit was not accepted')
  await new Promise((resolve) => setTimeout(resolve, 8_000))

  const after = await readPosition(me)
  assert.ok(
    after.shares > before.shares,
    `shares did not grow: ${formatShares(before.shares, before.decimals)} -> ${formatShares(after.shares, after.decimals)}`,
  )
  assert.ok(
    after.poolTvlAssets > before.poolTvlAssets,
    `the pool did not grow: ${formatUsdc(before.poolTvlAssets)} -> ${formatUsdc(after.poolTvlAssets)}`,
  )

  // And back, so the test leaves the pool as it found it rather than accumulating a position with
  // every run.
  const minted = after.shares - before.shares
  const redeemed = await wallet.sendTransaction({ to: POOL, data: encodeRedeem(minted, me, me) })
  assert.ok(redeemed.startsWith('0x'), 'the redemption was not accepted')
  await new Promise((resolve) => setTimeout(resolve, 8_000))

  const restored = await readPosition(me)
  assert.equal(
    restored.shares,
    before.shares,
    `the position did not return: ${formatShares(restored.shares, restored.decimals)}`,
  )
})
