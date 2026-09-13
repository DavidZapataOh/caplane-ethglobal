import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RejectReason } from 'caplane-sdk'
import { copyFor } from './rejection-copy.ts'

// The one that matters most. A financier refused for a collision learns that the claim is taken —
// and must not learn, or be able to guess from the words, anything about who took it.
test('AlreadyEncumbered names the fact and nothing about the counterpart', () => {
  const { headline, body } = copyFor(RejectReason.AlreadyEncumbered)
  assert.match(headline, /already (pledged|encumbered)/i)
  for (const forbidden of ['borrower', 'lender', 'invoice', 'amount', 'debtor', 'who']) {
    assert.doesNotMatch(body.toLowerCase(), new RegExp(forbidden))
  }
})

// An unmapped reason must fail where a test can see it, never render "undefined" at a business.
test('every declared reason has copy, including Unset', () => {
  for (const value of Object.values(RejectReason)) {
    assert.doesNotThrow(() => copyFor(value))
  }
})

test('no reason is described as a failure of the system itself', () => {
  // A refusal is a verdict, not an outage. Saying "error" would send a business to support for
  // something the enclave decided on purpose.
  for (const value of Object.values(RejectReason)) {
    assert.doesNotMatch(copyFor(value).headline.toLowerCase(), /error|failed|broken/)
  }
})
