import { expect, test } from 'bun:test'
import { COMPONENT_ORDER, INDEXED_COMPONENTS, LEDGER_CONSTANT } from './schema'

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

// Indexing a component every claim shares means a posting list holding the whole registry.
test('the index excludes every component the ledger fixes', () => {
  for (const name of LEDGER_CONSTANT) expect(INDEXED_COMPONENTS).not.toContain(name)
})

test('the index holds the four components that discriminate', () => {
  expect(INDEXED_COMPONENTS).toEqual(['debtorTaxId', 'invoiceNumber', 'amountBucket', 'dueDate'])
})

// Excluded from the index, not from the tuple: they still hash, still count, and are what will
// separate two ledgers the day there are two. Cardinality alone would not catch a name that
// belongs to neither set, or to both, so the partition is checked as a partition.
test('the index and the constants partition the tuple exactly', () => {
  expect([...INDEXED_COMPONENTS, ...LEDGER_CONSTANT].sort()).toEqual([...COMPONENT_ORDER].sort())
})
