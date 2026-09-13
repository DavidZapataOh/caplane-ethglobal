import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DOMAIN_SUPPORT, PAPERS, renderRelatedWork } from './related-work.ts'

/**
 * Exact identifiers, with the version where the source gives one. A citation that drops `v1` points
 * at whatever the latest revision happens to be, which is not what was read.
 */
test('exactly three papers, by exact arXiv id', () => {
  assert.equal(PAPERS.length, 3)
  assert.deepEqual(
    PAPERS.map((p) => p.arxiv).sort(),
    ['arXiv:2603.23226', 'arXiv:2604.03434v1', 'arXiv:2606.27803v2'],
  )
})

test('every paper names both what this takes from it and where it diverges', () => {
  for (const p of PAPERS) {
    assert.ok(p.takes.trim().length > 0, `${p.id} has no "takes"`)
    assert.ok(p.diverges.trim().length > 0, `${p.id} has no "diverges"`)
    assert.ok(p.title.trim().length > 0 && p.authors.trim().length > 0, `${p.id} is half-cited`)
  }
})

test('the divergence from Moore is structural, not a better incentive', () => {
  assert.match(PAPERS.find((p) => p.id === 'moore')?.diverges ?? '', /structural/i)
})

test('the divergence from Uzun is the trust base, named by its own term', () => {
  assert.match(PAPERS.find((p) => p.id === 'uzun')?.diverges ?? '', /RSE|realization soundness/i)
})

/**
 * Three comparisons, three closures. A fourth paper that confirms the domain but has no closure to
 * compare would dilute the sentence the whole section exists to earn, so it is a note and not an
 * item.
 */
test('the domain-support paper is a note, not a fourth item', () => {
  assert.equal(DOMAIN_SUPPORT.arxiv, 'arXiv:2407.19979')
  assert.equal(
    PAPERS.some((p) => p.arxiv === DOMAIN_SUPPORT.arxiv),
    false,
  )
})

test('the render puts the three first and the note after', () => {
  const md = renderRelatedWork()
  const moore = md.indexOf('2604.03434')
  const domain = md.indexOf('2407.19979')
  assert.ok(moore > 0, 'Moore is missing from the render')
  assert.ok(domain > moore, 'domain support must come after the three')
})

test('one divergence claims nothing, and says so rather than inventing one', () => {
  assert.match(PAPERS.find((p) => p.id === 'gyokuro')?.diverges ?? '', /no structural divergence/i)
})
