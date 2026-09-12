import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arcTestnet } from './chain.js'
import { deployments } from './deployments.js'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

// viem ships 599 chain definitions and none of them is Arc. A wrong id silently reads a different
// chain, and every answer would be about somebody else's contracts.
test('the chain is Arc testnet', () => {
  assert.equal(arcTestnet.id, 5042002)
  assert.equal(arcTestnet.nativeCurrency.decimals, 6)
  assert.equal(arcTestnet.nativeCurrency.symbol, 'USDC')
})

// Multicall3 is deployed at the canonical address on this chain. viem only batches when the chain
// declares it, so omitting the declaration costs one round trip per read and nothing says so.
test('multicall3 is declared so reads batch', () => {
  assert.equal(arcTestnet.contracts?.multicall3?.address, '0xcA11bde05977b3631167028862bE2a173976CA11')
})

// The addresses changed once already. A hand-copied constant would have gone stale that day, in a
// package whose whole job is telling a stranger where to look.
test('addresses are read from the deployment record, never retyped', () => {
  const book = JSON.parse(read('../../../contracts/abi/deployments.arc-testnet.json')) as Record<string, string>
  assert.equal(deployments.registry, book.registry)
  assert.equal(deployments.inbox, book.inbox)
  assert.equal(deployments.pool, book.pool)
  assert.equal(deployments.escrow, book.escrow)
  assert.equal(/0x[0-9a-fA-F]{40}/.test(read('../../src/deployments.ts')), false)
})

// The selector exceeds Number.MAX_SAFE_INTEGER. It is a string in the record so it cannot round on
// the way in, and a bigint on the way out so it cannot round on the way through a caller.
test('the chain selector survives as a bigint', () => {
  assert.equal(typeof deployments.chainSelector, 'bigint')
  assert.equal(deployments.chainSelector, 3034092155422581607n)
  assert.notEqual(Number(deployments.chainSelector).toString(), deployments.chainSelector.toString())
})

// The package ships its own copy because a consumer cannot reach outside it, and a copy with no
// gate is how a stale address gets shipped. The frozen-artifact rule does not cover a JSON file:
// it matches basenames index.ts and frozen.ts only. So this test is the gate.
test('the committed address book is byte-identical to the deployment record', () => {
  assert.equal(
    read('../../abi/deployments.arc-testnet.json'),
    read('../../../contracts/abi/deployments.arc-testnet.json'),
    'the committed copy has drifted',
  )
})

// The built copy is compared by value, not by bytes: tsc reserializes a JSON file when it copies it
// into the output — measured, 701 bytes in and 727 out, reindented — so a byte comparison here
// would fail against a file nobody edited. What matters in the artifact is the values a consumer
// reads, and those have to survive the copy.
test('the built address book carries the same values', () => {
  assert.deepEqual(
    JSON.parse(read('../abi/deployments.arc-testnet.json')),
    JSON.parse(read('../../../contracts/abi/deployments.arc-testnet.json')),
  )
})
