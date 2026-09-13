import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Outcome } from './classify.ts'
import { record, render, empty } from './journal.ts'

const id = (n: number) => `0x${String(n).padStart(2, '0').repeat(32)}` as `0x${string}`

const bounced = (n: number): Outcome => ({
  kind: 'bounced',
  submissionId: id(n),
  block: BigInt(100 + n),
  reason: 1,
})
const undecided = (n: number): Outcome => ({
  kind: 'undecidable',
  submissionId: id(n),
  why: 'the registry did not answer for itself',
})

/**
 * Folding the two together is how a harness ends up reporting a run of outages as a run of proofs.
 * They are different claims about the world and they are counted apart.
 */
test('the journal reports undecidable iterations separately from bounces', () => {
  const after = [bounced(1), undecided(2), bounced(3)].reduce(record, empty())
  assert.equal(after.bounced, 2)
  assert.equal(after.undecidable, 1)
  assert.equal(after.unexpected, 0)
})

/**
 * A freshly started worker knows nothing. Rendering `0/0` as a percentage invents a number, and
 * rendering `100%` from one iteration invents confidence — both are the kind of figure a reader
 * would quote back at us.
 */
test('the journal refuses to report a rate it cannot support', () => {
  assert.throws(() => render(empty()), /nothing decided/i)
})

test('the rendered evidence names every outcome, not just the good one', () => {
  const text = render([bounced(1), undecided(2)].reduce(record, empty()))
  assert.match(text, /bounced\s+1/)
  assert.match(text, /undecidable\s+1/)
  // The residual window is a property of the method, so it travels with the numbers rather than
  // living only in a plan nobody reading this file will see.
  assert.match(text, /enclave/i)
})

test('an unexpected outcome carries its reason into the record', () => {
  const after = record(empty(), { kind: 'unexpected', submissionId: id(4), reason: 2 })
  assert.equal(after.unexpected, 1)
  assert.deepEqual(after.reasons, { 2: 1 })
})
