import { expect, test } from 'bun:test'
import { agreement } from '../match'
import { COMPONENT_ORDER, LEDGER_CONSTANT } from '../schema'
import type { MeasuredClaim } from './corpus'

// The tests read the committed corpus, never the API: CI has no network and no credentials,
// and every local run would burn a daily quota that was already three quarters spent.
const corpus = (await Bun.file(
  new URL('../../evidence/claim/08-corpus.json', import.meta.url),
).json()) as MeasuredClaim[]

const theirs = corpus.filter((c) => !c.seededByUs)

test('the corpus holds far more independent claims than ones we seeded', () => {
  expect(theirs.length).toBeGreaterThan(corpus.length - theirs.length)
  expect(theirs.length).toBeGreaterThan(40)
})

// The schema demanded a tax number and the ledger has one. Without the fallback this corpus
// would hold a single claim, so the test is that the fallback is what populated it.
test('the fallback is what made a corpus possible', () => {
  const byName = corpus.filter((c) => c.identitySource === 'name').length
  expect(byName).toBeGreaterThan(corpus.length / 2)
})

test('currency, issuer and country are constant across the whole corpus', () => {
  for (const name of LEDGER_CONSTANT) {
    expect(new Set(corpus.map((c) => c.components[name])).size).toBe(1)
  }
})

// Checked rather than assumed. Invoice-number uniqueness is a property of the raw string and
// of one document type; matching happens on the canonical form, over a filtered set.
test('no two distinct claims agree on all seven', () => {
  for (let i = 0; i < theirs.length; i++) {
    for (let j = i + 1; j < theirs.length; j++) {
      expect(agreement(theirs[i]!.components, theirs[j]!.components)).toBeLessThan(
        COMPONENT_ORDER.length,
      )
    }
  }
})
