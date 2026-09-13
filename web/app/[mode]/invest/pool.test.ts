// web/app/[mode]/invest/pool.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toFunctionSelector, encodeFunctionData } from 'viem'
import {
  POOL,
  SELECTORS,
  readPosition,
  readAllowance,
  encodeApprove,
  encodeDeposit,
  encodeRedeem,
  formatUsdc,
  formatShares,
  nextDepositStep,
  validateRedeem,
} from './pool.ts'

const INVESTOR = '0x000000000000000000000000000000000000dEaD' as const // never funded; reads as zero, on purpose
const ERC20_ABI = [
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const
const POOL_ABI = [
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'redeem', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

test('every hand-written selector is the real one', () => {
  assert.equal(SELECTORS.deposit, toFunctionSelector('function deposit(uint256,address)'))
  assert.equal(SELECTORS.redeem, toFunctionSelector('function redeem(uint256,address,address)'))
  assert.equal(SELECTORS.approve, toFunctionSelector('function approve(address,uint256)'))
  assert.equal(SELECTORS.allowance, toFunctionSelector('function allowance(address,address)'))
  assert.equal(SELECTORS.balanceOf, toFunctionSelector('function balanceOf(address)'))
  assert.equal(SELECTORS.totalAssets, toFunctionSelector('function totalAssets()'))
  assert.equal(SELECTORS.decimals, toFunctionSelector('function decimals()'))
  assert.equal(SELECTORS.maxRedeem, toFunctionSelector('function maxRedeem(address)'))
  assert.equal(SELECTORS.outstandingPrincipal, toFunctionSelector('function outstandingPrincipal()'))
})

test('encodeApprove matches viem encoding the pool as spender, field for field', () => {
  const mine = encodeApprove(1_000_000n)
  const theirs = encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [POOL, 1_000_000n] })
  assert.equal(mine, theirs)
})

test('encodeDeposit sends the asset amount and names the caller as receiver', () => {
  const mine = encodeDeposit(1_000_000n, INVESTOR)
  const theirs = encodeFunctionData({ abi: POOL_ABI, functionName: 'deposit', args: [1_000_000n, INVESTOR] })
  assert.equal(mine, theirs)
})

test('encodeRedeem names the same address as receiver and owner — this console never redeems on behalf of anyone else', () => {
  const mine = encodeRedeem(500n, INVESTOR, INVESTOR)
  const theirs = encodeFunctionData({ abi: POOL_ABI, functionName: 'redeem', args: [500n, INVESTOR, INVESTOR] })
  assert.equal(mine, theirs)
})

test('reading the live pool matches what the pool actually holds', async () => {
  const position = await readPosition(INVESTOR)
  assert.equal(position.decimals, 18)
  assert.ok(position.poolTvlAssets > 0n, 'the deployed pool already holds deposits')
  assert.equal(position.shares, 0n, 'the burn address holds no shares')
  assert.equal(position.valueAssets, 0n)
})

test('an address with no allowance needs to approve before it can deposit', async () => {
  const allowance = await readAllowance(INVESTOR)
  assert.equal(allowance, 0n)
  assert.equal(nextDepositStep(allowance, 1_000_000n), 'approve')
})

test('an allowance at or above the requested amount skips straight to deposit', () => {
  assert.equal(nextDepositStep(1_000_000n, 1_000_000n), 'deposit')
  assert.equal(nextDepositStep(2_000_000n, 1_000_000n), 'deposit')
})

test('a redeem request within the live cap is valid', async () => {
  const position = await readPosition(INVESTOR)
  assert.equal(validateRedeem(0n, position.redeemableAssets), undefined)
})

test('a redeem request above the cap names the cap, not a generic refusal', () => {
  assert.equal(
    validateRedeem(10_000_000n, 3_000_000n),
    'Up to 3.000000 USDC is available right now — the rest is out on active advances.',
  )
})

test('USDC formats at six decimals, never at the pool share count', () => {
  assert.equal(formatUsdc(16_160_000n), '16.160000 USDC')
  assert.equal(formatUsdc(0n), '0.000000 USDC')
})

test('shares format at the decimals the contract actually reports, not an assumed 18', () => {
  assert.equal(formatShares(16_000_000_000_000_000_000n, 18), '16.000000000000000000 cpUSDC')
})
