// scripts/budgets/lighthouse.test.ts — bun:test, same as check.test.ts in this directory
import { test, expect } from 'bun:test'
import { metricsOf, evaluate } from './lighthouse.mjs'

// Shape verified against lighthouse 13.4.1's own audit schema: audits are keyed by id and carry
// numericValue in the unit the metric is defined in — ms for time-based audits, a unitless score
// for CLS. This fixture is data, not a mock of a network call: nothing here is a service Lighthouse
// would otherwise reach over the wire.
const lhr = (overrides = {}) => ({
  audits: {
    'largest-contentful-paint': { numericValue: 1200 },
    'cumulative-layout-shift': { numericValue: 0.02 },
    'total-blocking-time': { numericValue: 40 },
    ...overrides,
  },
})

test('metricsOf reads the three audits Lighthouse names, by id', () => {
  expect(metricsOf(lhr())).toEqual({ lcpMs: 1200, clsScore: 0.02, tbtMs: 40 })
})

test('a metric within budget produces no violation', () => {
  expect(evaluate({ lcpMs: 1200, clsScore: 0.02, tbtMs: 40 }, { lcpMs: 2500, clsScore: 0.1, tbtMs: 200 })).toEqual([])
})

test('each metric is checked independently — one over budget does not hide the others', () => {
  const found = evaluate({ lcpMs: 3000, clsScore: 0.2, tbtMs: 40 }, { lcpMs: 2500, clsScore: 0.1, tbtMs: 200 })
  expect(found).toHaveLength(2)
  expect(found[0]).toMatch(/lcpMs 3000 exceeds/)
  expect(found[1]).toMatch(/clsScore 0.2 exceeds/)
})

test('a missing audit throws, naming which one — a silent zero would pass every budget', () => {
  expect(() => metricsOf(lhr({ 'cumulative-layout-shift': undefined }))).toThrow(/cumulative-layout-shift/)
})

// Found by running the measurer against a URL Chrome could not reach: Lighthouse still answers,
// with the audits present and `numericValue` undefined. `JSON.stringify` then drops the keys and
// the run reports `{"url":...}` with no metrics at all — which clears every budget. A measurement
// that measures nothing has to fail louder than one that measures badly.
test('an audit present but without a number throws, naming it', () => {
  expect(() => metricsOf(lhr({ 'largest-contentful-paint': {} }))).toThrow(
    /largest-contentful-paint/,
  )
})

test('a run Lighthouse itself reports as failed throws, rather than reporting nothing', () => {
  expect(() => metricsOf({ runtimeError: { code: 'NO_FCP' }, audits: lhr().audits })).toThrow(
    /NO_FCP/,
  )
})
