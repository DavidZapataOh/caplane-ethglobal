import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classify } from './classify.ts'

/**
 * The registry publishes one reason code for two different things: a lien that really is there,
 * and a registry that could not be read. Both refuse, so both are honest — but only one of them
 * says anything about double-pledging. A harness that counted reason one would count an outage as
 * a success and show green through it.
 *
 * So the unit of account is not the refusal. It is the refusal beside two readings taken
 * separately: that the target is still encumbered, and that the registry answered at all.
 */
const SUBMISSION = `0x${'ab'.repeat(32)}` as const
const ACTIVE = 1
const RELEASED = 2

test('a refusal with an unreachable registry is not a bounce', () => {
  const outcome = classify({
    submissionId: SUBMISSION,
    verdict: { kind: 'rejected', reason: 1, block: 100n },
    lienStatus: ACTIVE,
    registryAnswers: false,
  })
  assert.equal(outcome.kind, 'undecidable')
})

test('a refusal against an inactive target is not a bounce', () => {
  const outcome = classify({
    submissionId: SUBMISSION,
    verdict: { kind: 'rejected', reason: 1, block: 100n },
    lienStatus: RELEASED,
    registryAnswers: true,
  })
  assert.equal(outcome.kind, 'undecidable')
})

// The opposite failure mode, and just as useless: a discriminator so strict nothing ever counts.
test('a real collision against a live lien is a bounce', () => {
  const outcome = classify({
    submissionId: SUBMISSION,
    verdict: { kind: 'rejected', reason: 1, block: 100n },
    lienStatus: ACTIVE,
    registryAnswers: true,
  })
  assert.deepEqual(outcome, { kind: 'bounced', submissionId: SUBMISSION, block: 100n, reason: 1 })
})

/**
 * A run of these means the confirmation expired, and the harness has to say so. Counting any
 * refusal as a bounce is the decorative harness this exists not to be.
 */
test('an unconfirmed refusal is named, never counted', () => {
  const outcome = classify({
    submissionId: SUBMISSION,
    verdict: { kind: 'rejected', reason: 2, block: 100n },
    lienStatus: ACTIVE,
    registryAnswers: true,
  })
  assert.deepEqual(outcome, { kind: 'unexpected', submissionId: SUBMISSION, reason: 2 })
})

// If the harness ever records a lien it has become the registry-poisoning attack, run by us, in a
// loop. That is an emergency, and it must not read as the best possible result.
test('recording a lien is an emergency, not a success', () => {
  const outcome = classify({
    submissionId: SUBMISSION,
    verdict: { kind: 'recorded' },
    lienStatus: ACTIVE,
    registryAnswers: true,
  })
  assert.deepEqual(outcome, { kind: 'unexpected', submissionId: SUBMISSION, reason: 0 })
})

test('a verdict that never arrived is undecidable, not a bounce', () => {
  const outcome = classify({
    submissionId: SUBMISSION,
    verdict: { kind: 'pending' },
    lienStatus: ACTIVE,
    registryAnswers: true,
  })
  assert.equal(outcome.kind, 'undecidable')
})
