import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PRIVY_CONFIG } from './privy-config.ts'

test('Arc Testnet is declared explicitly, by chain id', () => {
  const ids = PRIVY_CONFIG.supportedChains.map((c) => c.id)
  assert.ok(ids.includes(5042002), `5042002 missing from ${JSON.stringify(ids)}`)
})

test('Arc Testnet is the default chain — this is a single-chain app', () => {
  assert.equal(PRIVY_CONFIG.defaultChain.id, 5042002)
})
