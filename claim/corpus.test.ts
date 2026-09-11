import { expect, test } from 'bun:test'
import { COMPONENT_ORDER, type ClaimInput } from './schema'
import { toComponents } from './index'

type Corpus = {
  canonical: ClaimInput
  variants: Array<Partial<ClaimInput> & { label: string; expectNoMatch?: boolean }>
}

const corpus = (await Bun.file(
  new URL('../evidence/data/02-invoice-corpus.json', import.meta.url),
).json()) as Corpus

const canonical = toComponents(corpus.canonical)
const agree = (variant: Partial<ClaimInput>) => {
  const other = toComponents({ ...corpus.canonical, ...variant })
  return COMPONENT_ORDER.filter((name) => canonical[name] === other[name]).length
}

test('every component of the canonical claim canonicalises to something', () => {
  for (const name of COMPONENT_ORDER) expect(canonical[name]).not.toBe('')
})

// An empty component compares equal to any other empty one on-chain, so a claim made of
// punctuation would match another on every component at once. It is refused at the door.
test('a claim with a component that canonicalises to nothing is refused', () => {
  expect(() => toComponents({ ...corpus.canonical, invoiceNumber: '---' })).toThrow(/nothing/)
})

// Six of seven is what the worst real reformatting costs: dropping the invoice number's
// prefix, the one thing canonicalisation cannot absorb.
test('every reformatted variant agrees on at least six of seven', () => {
  for (const v of corpus.variants.filter((x) => !x.expectNoMatch)) {
    expect(agree(v)).toBeGreaterThanOrEqual(6)
  }
})

// The separator is absorbed entirely, so that reformatting costs nothing. A 6 here means the
// text canonicaliser is wrong.
test('a separator inside the invoice number costs no component at all', () => {
  expect(agree({ invoiceNumber: 'ORC-1043' })).toBe(7)
})

// The bar the seeded corpus could not clear: its original negative agreed on 6, exactly like
// a good variant. A second real invoice can only reach 3 — the three the ledger fixes.
test('a genuinely different claim agrees on exactly the three ledger constants', () => {
  for (const v of corpus.variants.filter((x) => x.expectNoMatch)) {
    expect(agree(v)).toBe(3)
  }
})
