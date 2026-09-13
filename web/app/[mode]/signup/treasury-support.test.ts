import assert from 'node:assert/strict'
import { test } from 'node:test'
import { messageFor, outcomeOf, validOrgName, weiOf } from './treasury-support.ts'

test('rejects an organization name that is empty or only whitespace', () => {
  assert.equal(validOrgName(''), false)
  assert.equal(validOrgName('   '), false)
})

test('accepts an ordinary business name', () => {
  assert.equal(validOrgName('Acme Receivables Ltd'), true)
})

test('converts a decimal amount to wei — the native asset is 18-decimal', () => {
  assert.equal(weiOf('0.02'), 20_000_000_000_000_000n)
  assert.equal(weiOf('1'), 1_000_000_000_000_000_000n)
  assert.equal(weiOf(''), 0n)
})

test('a fraction longer than 18 places is truncated, never rounded up past it', () => {
  assert.equal(weiOf('0.0000000000000000009'), 0n)
})

test('a policy violation reads as a threshold block, not a generic error', () => {
  assert.match(messageFor({ status: 400, error: { code: 'policy_violation' } }), /threshold/i)
})

test('an unrelated failure never claims the policy blocked it', () => {
  assert.doesNotMatch(
    messageFor({ status: 400, error: { code: 'insufficient_funds' } }),
    /threshold|policy/i,
  )
})

test('a broadcast that lands is reported by its hash, not as "signed"', () => {
  assert.deepEqual(outcomeOf({ hash: '0xabc' }), { kind: 'sent', detail: '0xabc' })
})

test('a refusal the policy issued is a block, and names the threshold', () => {
  const out = outcomeOf({ status: 400, error: { code: 'policy_violation' }, blockedByPolicy: true })
  assert.equal(out.kind, 'blocked')
  assert.match(out.detail, /threshold/i)
})

test('an empty wallet is reported as an empty wallet, never as a policy block', () => {
  // The two are both refusals and both plausible in a demo; calling the first the second would
  // claim a control did something it never did.
  const out = outcomeOf({ status: 400, error: { code: 'insufficient_funds' } })
  assert.equal(out.kind, 'error')
  assert.doesNotMatch(out.detail, /threshold|policy/i)
})

test('a broadcast the chain refused carries the chain’s own words', () => {
  const out = outcomeOf({ rpcError: 'insufficient funds for gas * price + value' })
  assert.equal(out.kind, 'error')
  assert.match(out.detail, /insufficient funds for gas/)
})
