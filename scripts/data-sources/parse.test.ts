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

// Fixtures are verbatim rows and counts from the live payload, whose envelope is
// { results, sources, total }. `total` is how many matches exist; `results` is only the page
// that `size` allowed through, so the two diverge on any query with more matches than size.

test('a listed entity is a hit', () => {
  expect(
    hasSanctionsHit({
      total: 3,
      results: [
        { name: 'KUNLUN SHIPPING COMPANY LIMITED', source: 'Specially Designated Nationals (SDN) - Treasury Department' },
      ],
    }),
  ).toBe(true)
})

test('a name on no list is not a hit', () => {
  expect(hasSanctionsHit({ total: 0, results: [] })).toBe(false)
})

test('a response carrying no count is not a hit', () => {
  expect(hasSanctionsHit({})).toBe(false)
})

// Reading the page instead of the count fails in the unsafe direction: a sanctioned
// counterparty would read clean whenever the page happens not to carry the match.
test('a match the page does not carry is still a hit', () => {
  expect(hasSanctionsHit({ total: 400, results: [] })).toBe(true)
})
