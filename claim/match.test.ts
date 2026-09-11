import { expect, test } from 'bun:test'
import { toComponents } from './index'
import { COMPONENT_ORDER, type ClaimComponents, type ClaimInput } from './schema'
import { agreement } from './match'

const INPUT: ClaimInput = {
  debtorTaxId: '11 000 111 000',
  invoiceNumber: 'ORC1043',
  amountMinor: '27500000',
  currency: 'AUD',
  dueDate: '2026-12-31',
  issuerTaxId: 'e1218a28-7437-47ec-bfb5-252092825083',
  country: 'AU',
}

const components = (over: Partial<ClaimInput> = {}): ClaimComponents =>
  toComponents({ ...INPUT, ...over })

test('a claim agrees with itself on every component', () => {
  expect(agreement(components(), components())).toBe(7)
})

test('one differing component costs exactly one', () => {
  expect(agreement(components(), components({ invoiceNumber: '1043' }))).toBe(6)
})

test('nothing in common agrees on nothing', () => {
  const other = Object.fromEntries(COMPONENT_ORDER.map((n) => [n, 'x'])) as ClaimComponents
  expect(agreement(components(), other)).toBe(0)
})

// No exclusions and no special cases: the registry compares peppered commitments for equality
// and counts. A claim that cannot produce a component is refused at parse time instead, which
// is the only way the two counts stay identical.
test('a claim carrying an empty component never reaches the count', () => {
  expect(() => components({ debtorTaxId: '---' })).toThrow(/canonicalises to nothing/)
})

import { THRESHOLD, isCollision } from './match'

test('the threshold is six of seven', () => {
  expect(THRESHOLD).toBe(6)
})

// Seven would reject this, and it is a legitimate reformatting: dropping the invoice number's
// prefix is the one thing canonicalisation cannot absorb.
test('a claim that lost one component is still a collision', () => {
  expect(isCollision(components(), components({ invoiceNumber: '1043' }))).toBe(true)
})

test('a claim that lost two components is not', () => {
  expect(
    isCollision(components(), components({ invoiceNumber: '1043', dueDate: '2027-06-30' })),
  ).toBe(false)
})

// The floor, asserted against the second real invoice in the ledger rather than against
// hand-typed strings: currency, issuerTaxId and country are constants of the book.
test('a second real invoice from the same ledger is not a collision', () => {
  const other = components({
    debtorTaxId: 'Maddox Publishing Group',
    invoiceNumber: 'ORC1049',
    amountMinor: '1320000',
    dueDate: '2027-06-30',
  })
  expect(agreement(components(), other)).toBe(3)
  expect(isCollision(components(), other)).toBe(false)
})

// An amount either side of a power of two loses its bucket, and that costs one component —
// exactly what the threshold tolerates. This is why the neighbouring-bucket strategy is not
// built. If the threshold ever drops below six, this test fails and reopens that decision.
test('an amount across a bucket boundary is still a collision', () => {
  const justBelow = components({ amountMinor: '16700000' })
  const justAbove = components({ amountMinor: '16800000' })
  expect(agreement(justBelow, justAbove)).toBe(6)
  expect(isCollision(justBelow, justAbove)).toBe(true)
})

// And the pair that does defeat it, so the limitation is recorded rather than implied.
test('a boundary amount plus one other reformatting is not a collision', () => {
  const a = components({ amountMinor: '16700000' })
  const b = components({ amountMinor: '16800000', invoiceNumber: '1043' })
  expect(isCollision(a, b)).toBe(false)
})

import { decide } from './match'

const ZERO = `0x${'0'.repeat(64)}`

test('no candidate is clear', () => {
  expect(decide({ lienId: ZERO, matched: 0 })).toEqual({ collision: false })
})

test('a candidate at the threshold is a collision, and names the lien', () => {
  expect(decide({ lienId: '0xabc', matched: 6 })).toEqual({ collision: true, lienId: '0xabc' })
})

test('a candidate below the threshold is clear', () => {
  expect(decide({ lienId: '0xabc', matched: 5 })).toEqual({ collision: false })
})

// This input is decoded from a raw JSON-RPC response to an endpoint named in configuration,
// not from a typed contract call. A count with no candidate is a wrong endpoint or a malformed
// response, and the verdict it produces crosses the one-way door.
test('a count with no lien is refused rather than interpreted', () => {
  expect(() => decide({ lienId: ZERO, matched: 6 })).toThrow(/inconsistent/)
})
