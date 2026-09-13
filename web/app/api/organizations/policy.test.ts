import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isPolicyViolation } from './policy.ts'

test('recognises a policy violation by its code', () => {
  assert.equal(isPolicyViolation({ status: 400, error: { code: 'policy_violation' } }), true)
})

test('does not mistake a simulation failure for a policy violation', () => {
  assert.equal(isPolicyViolation({ status: 400, error: { code: 'insufficient_funds' } }), false)
})

test('does not mistake a quorum failure for a policy violation', () => {
  assert.equal(
    isPolicyViolation({
      status: 400,
      error: { code: 'insufficient_correct_authorization_signatures' },
    }),
    false,
  )
})
