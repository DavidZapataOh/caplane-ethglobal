import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSignupPolicyRules } from './rules.ts'

test('allows a transfer strictly below the threshold', () => {
  const rules = buildSignupPolicyRules(1_000_000_000_000_000_000n)
  const allow = rules.find((r) => r.action === 'ALLOW')
  assert.equal(allow?.conditions[0]?.operator, 'lt')
  assert.equal(allow?.conditions[0]?.value, '1000000000000000000')
})

test('denies a transfer at or above the threshold', () => {
  const rules = buildSignupPolicyRules(1_000_000_000_000_000_000n)
  const deny = rules.find((r) => r.action === 'DENY')
  assert.equal(deny?.conditions[0]?.operator, 'gte')
  assert.equal(deny?.conditions[0]?.value, '1000000000000000000')
})

test('both rules gate the same method the server will call', () => {
  const rules = buildSignupPolicyRules(1n)
  assert.ok(rules.every((r) => r.method === 'eth_signTransaction'))
})

test('the two rules leave no gap and no overlap at the threshold itself', () => {
  // `lt` below and `gte` at-or-above: every amount matches exactly one rule. A pair written `lt`
  // and `gt` would leave the threshold itself matching neither, and deny-by-default would refuse
  // it for the wrong reason — attributable to "no rule matched", not to the threshold.
  const rules = buildSignupPolicyRules(100n)
  const operators = rules.map((r) => r.conditions[0]?.operator).sort()
  assert.deepEqual(operators, ['gte', 'lt'])
})
