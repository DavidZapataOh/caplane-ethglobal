import { expect, test } from 'bun:test'
import { isPolicyViolation } from './deny'

// The SDK surfaces failures as an APIError carrying `status` and an `error` object.

test('recognises a policy violation by its code', () => {
  expect(isPolicyViolation({ status: 400, error: { code: 'policy_violation' } })).toBe(true)
})

// The next two are the ones that matter. Both are 400s from different controls, and calling
// either a policy denial would make the interface claim a block that never happened.

test('does not mistake a simulation failure for a policy violation', () => {
  expect(isPolicyViolation({ status: 400, error: { code: 'insufficient_funds' } })).toBe(false)
})

test('does not mistake a quorum failure for a policy violation', () => {
  expect(
    isPolicyViolation({
      status: 400,
      error: { code: 'insufficient_correct_authorization_signatures' },
    }),
  ).toBe(false)
})
