import { expect, test } from 'bun:test'
import { hasSanctionsHit, invoiceIdOf, isUnpaid } from './parse'

// Amounts are JSON numbers and every field is optional: both come from the published
// OpenAPI schema, where AmountDue is `type: number, format: double` and Invoice
// declares no required properties.

test('an authorised invoice with an outstanding balance is unpaid', () => {
  expect(isUnpaid({ Status: 'AUTHORISED', AmountDue: 1025.0, AmountPaid: 1000.0 })).toBe(true)
})

test('a settled invoice is not unpaid', () => {
  expect(isUnpaid({ Status: 'PAID', AmountDue: 0.0, AmountPaid: 1025.0 })).toBe(false)
})

test('an authorised invoice with nothing outstanding is not unpaid', () => {
  expect(isUnpaid({ Status: 'AUTHORISED', AmountDue: 0.0, AmountPaid: 1025.0 })).toBe(false)
})

test('a draft invoice is not unpaid — it is not owed yet', () => {
  expect(isUnpaid({ Status: 'DRAFT', AmountDue: 1025.0, AmountPaid: 0.0 })).toBe(false)
})

test('an invoice that omits its balance is not unpaid', () => {
  expect(isUnpaid({ Status: 'AUTHORISED' })).toBe(false)
})

test('reads the invoice id out of a response envelope', () => {
  const body = { Invoices: [{ InvoiceID: '243216c5-369e-4056-ac67-05388f86dc81' }] }
  expect(invoiceIdOf(body)).toBe('243216c5-369e-4056-ac67-05388f86dc81')
})

// The screening fixtures are verbatim rows from the published consolidated list, not invented
// ones. `results` is the array the payload actually carries; `size` caps its length, so any
// non-empty page is a hit regardless of how many matches exist upstream.

test('a listed entity is a hit', () => {
  expect(
    hasSanctionsHit({
      results: [{ name: 'BANK OF KUNLUN CO LTD', source: 'Capta List (CAP) - Treasury Department' }],
    }),
  ).toBe(true)
})

test('a name on no list is not a hit', () => {
  expect(hasSanctionsHit({ results: [] })).toBe(false)
})

test('a response carrying no result set is not a hit', () => {
  expect(hasSanctionsHit({})).toBe(false)
})
