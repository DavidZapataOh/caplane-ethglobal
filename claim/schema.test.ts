import { expect, test } from 'bun:test'
import { COMPONENT_ORDER, LEDGER_CONSTANT } from './schema'

test('ships exactly seven components, with no duplicates', () => {
  expect(COMPONENT_ORDER).toHaveLength(7)
  expect(new Set(COMPONENT_ORDER).size).toBe(7)
})

// The index travels inside the commitment preimage and the pepper never rotates, so this
// order cannot be tidied later. The test is the record of that, and of where it came from.
test('the order is the one the design change specifies, and it is not rearrangeable', () => {
  expect(COMPONENT_ORDER).toEqual([
    'debtorTaxId',
    'invoiceNumber',
    'amountBucket',
    'dueDate',
    'currency',
    'issuerTaxId',
    'country',
  ])
})

// Three of the seven are properties of the ledger, not of the claim. Any two claims from one
// organisation agree on all three before anything specific is compared, which is the floor
// every threshold has to clear.
test('names the three components that are constant for one ledger', () => {
  expect(LEDGER_CONSTANT).toEqual(['currency', 'issuerTaxId', 'country'])
})
