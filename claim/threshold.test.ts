import { expect, test } from 'bun:test'
import { ClaimType } from './abi/frozen'
import { toComponents } from './instrument'
import { THRESHOLD, agreement, isCollision, thresholdFor } from './match'

const FLEET = {
  debtorTaxId: '900123456',
  invoiceNumber: '1HGCM82633A004352',
  amountMinor: '1850000',
  dueDate: '2028-03-31',
  currency: 'USD',
  issuerTaxId: '811004321',
  country: 'US',
}

const of = (over: Partial<typeof FLEET> = {}) => toComponents(ClaimType.Equipment, { ...FLEET, ...over })

// Six is measured against 903 pairs of real invoices from one ledger. There is no such measurement
// for vehicles, and borrowing the number would be borrowing a result from a corpus that does not
// contain the instrument.
test('the threshold is per instrument, and vehicles are exact', () => {
  expect(thresholdFor(ClaimType.Invoice)).toBe(6)
  expect(thresholdFor(ClaimType.Equipment)).toBe(7)
  expect(THRESHOLD).toBe(6)
})

// The reason, made concrete, and the finding that justifies the whole plan. A fleet of identical
// vehicles financed by the same creditor to the same obligor on the same terms differs in exactly
// one component — the vin — so an inherited six would refuse the second truck as a double pledge of
// the first, which the borrower experiences as an unexplained no.
test('an identical fleet agrees on six and must not collide', () => {
  const first = of()
  const second = of({ invoiceNumber: '1HGCM82633A004353' })
  expect(agreement(first, second)).toBe(6)
  expect(isCollision(ClaimType.Equipment, first, second)).toBe(false)
  // And the same pair under the invoice threshold is exactly the false refusal being avoided.
  expect(isCollision(ClaimType.Invoice, first, second)).toBe(true)
})

// Exactness is only safe because a vin cannot be legitimately reformatted into a different
// canonical string. If it could, seven would refuse a real re-pledge of the same vehicle and the
// registry would be worse than useless for this type.
test('every real rendering of one vehicle still agrees on seven', () => {
  const base = of()
  const renderings: Array<[string, Partial<typeof FLEET>]> = [
    // A vin printed on a title carries spaces every four characters; canonicalText strips them.
    ['vin spaced', { invoiceNumber: '1HGC M8263 3A00 4352' }],
    // Lower case off a web form.
    ['vin lower cased', { invoiceNumber: '1hgcm82633a004352' }],
    // Hyphenated on an insurance document.
    ['vin hyphenated', { invoiceNumber: '1HGCM8-2633A-004352' }],
    // A day-first date, unambiguous because the day exceeds twelve.
    ['date day first', { dueDate: '31/03/2028' }],
    // A tax id with its punctuation.
    ['obligor punctuated', { debtorTaxId: '900.123.456' }],
    // Jurisdiction in lower case.
    ['country lower cased', { country: 'us' }],
  ]
  for (const [label, over] of renderings) {
    expect(agreement(base, of(over)), label).toBe(7)
    expect(isCollision(ClaimType.Equipment, base, of(over)), label).toBe(true)
  }
})

// A different vehicle from the same lender to the same obligor is the floor: six, never seven.
test('two vehicles never reach seven', () => {
  expect(agreement(of(), of({ invoiceNumber: '5YJ3E1EA7KF317000' }))).toBe(6)
})

// An unknown type must not silently borrow a threshold.
test('an unknown claim type has no threshold', () => {
  expect(() => thresholdFor(ClaimType.Lease)).toThrow(/claim type/)
})
