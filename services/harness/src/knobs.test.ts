import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LEDGER_CALLS_PER_ATTEMPT, intervalMs, iterationCap } from './knobs.ts'

/**
 * The cadence is a division, not a preference. Every attempt makes the enclave read the ledger
 * twice, and the tenant allows five thousand reads a day — shared with the people using the
 * product. At the scaffold's sixty seconds this worker alone would spend more than half of that.
 */
test('the interval is derived from the measured ledger quota', () => {
  assert.equal(intervalMs({}), 900_000)
  const perDay = (24 * 60 * 60 * 1000) / intervalMs({})
  assert.equal(perDay, 96)
  assert.equal(perDay * LEDGER_CALLS_PER_ATTEMPT, 192)
  assert.ok(perDay * LEDGER_CALLS_PER_ATTEMPT < 300, 'the daily ledger budget is 300 calls')
})

test('an explicit interval is honoured, and a nonsensical one is not', () => {
  assert.equal(intervalMs({ HARNESS_INTERVAL_MS: '60000' }), 60_000)
  assert.throws(() => intervalMs({ HARNESS_INTERVAL_MS: '0' }), /positive/i)
  assert.throws(() => intervalMs({ HARNESS_INTERVAL_MS: 'soon' }), /positive/i)
})

/**
 * Zero means no cap, and getting this backwards is silent and expensive: the worker would finish
 * its first cycle, exit, and Railway's ALWAYS policy would restart it for ever — a crash loop that
 * looks from outside exactly like a harness doing its job.
 */
test('an unset iteration cap runs forever, never zero times', () => {
  assert.equal(iterationCap({}), undefined)
  assert.equal(iterationCap({ HARNESS_ITERATIONS: '0' }), undefined)
  assert.equal(iterationCap({ HARNESS_ITERATIONS: '1' }), 1)
  assert.equal(iterationCap({ HARNESS_ITERATIONS: '10' }), 10)
})
