import { expect, test } from 'bun:test'
import type { MeasuredClaim } from './corpus'
import { falseMatchRate, upperBound95 } from './rates'

const corpus = (await Bun.file(
  new URL('../../evidence/claim/08-corpus.json', import.meta.url),
).json()) as MeasuredClaim[]
const theirs = corpus.filter((c) => !c.seededByUs)

// The interval is the claim; the point estimate is not. Both cases, one code path.
test('zero events degenerate to the rule of three', () => {
  expect(upperBound95(0, 903)).toBeCloseTo(3 / 903, 4)
})

test('one event gives a bound several times its point estimate', () => {
  const bound = upperBound95(1, 903)
  expect(bound).toBeGreaterThan(4 * (1 / 903))
  expect(bound).toBeLessThan(0.008)
})

test('the bound never collapses to the point estimate', () => {
  for (const x of [0, 1, 5, 20]) expect(upperBound95(x, 903)).toBeGreaterThan(x / 903)
})

test('the rate counts unordered pairs, each once', () => {
  const n = theirs.length
  expect(falseMatchRate(theirs, 6).pairs).toBe((n * (n - 1)) / 2)
})

// The measurement has to be able to report a non-zero rate, or it is decoration. One step down
// is where this ledger's shape shows.
test('lowering the threshold produces strictly more false matches', () => {
  expect(falseMatchRate(theirs, 5).observed).toBeGreaterThan(falseMatchRate(theirs, 6).observed)
})
