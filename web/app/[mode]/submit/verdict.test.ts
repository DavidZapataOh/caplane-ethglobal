import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REJECT_REASONS, paddedAddress, rejectionFilter, recordedFilter } from './verdict.ts'

const REGISTRY = '0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b' as const
const SUBMISSION = `0x${'ab'.repeat(32)}` as const
const BORROWER = '0x86Ec9f04485Db066CF155353f15eef356Ae90253' as const

// `SubmissionRejected(bytes32 indexed submissionId, uint8 reasonCode)` indexes the submission, so
// the node filters to this one submission and no other. A filter that matched the event signature
// alone would return every refusal the registry ever issued, and the page would report somebody
// else's.
test('a refusal is filtered by the submission id, in the first indexed slot', () => {
  const filter = rejectionFilter(REGISTRY, SUBMISSION)
  assert.equal(filter.address, REGISTRY)
  assert.equal(filter.topics[0], null)
  assert.equal(filter.topics[1], SUBMISSION)
})

// `LienRecorded(bytes32 indexed lienId, address indexed borrower, uint64 expiresAt)` indexes the
// borrower second, so the address goes in the third topic slot, left-padded to a word.
test('a recorded lien is filtered by the borrower, in the second indexed slot', () => {
  const filter = recordedFilter(REGISTRY, BORROWER)
  assert.equal(filter.topics[0], null)
  assert.equal(filter.topics[1], null)
  assert.equal(filter.topics[2], paddedAddress(BORROWER))
})

test('an address padded to a topic is 32 bytes, lowercase, and keeps its digits', () => {
  const padded = paddedAddress(BORROWER)
  assert.equal(padded.length, 66)
  assert.ok(padded.startsWith(`0x${'0'.repeat(24)}`))
  assert.ok(padded.endsWith(BORROWER.slice(2).toLowerCase()))
})

// The reason the enclave gives is a number on the wire. A page that showed the number would be
// asking a business to look up what 3 means while it decides whether to call its customer.
test('every reason code the registry can emit has words to show for it', () => {
  assert.equal(REJECT_REASONS.length, 10)
  assert.equal(REJECT_REASONS[1], 'already encumbered')
  assert.ok(REJECT_REASONS.every((reason) => reason.length > 0))
})
