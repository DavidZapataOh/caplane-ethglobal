import { expect, test } from 'bun:test'
import { INDEXED_POSITIONS } from '../contracts/abi/frozen'
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

test('the index holds the three components that discriminate and stay sparse', () => {
  expect(INDEXED_COMPONENTS).toEqual(['debtorTaxId', 'invoiceNumber', 'dueDate'])
})

// The one place the choice is written. A registry that indexed other positions and a schema
// that described these would disagree silently, and the disagreement is unobservable off-chain.
test('the declared index is derived from the frozen positions, not retyped', () => {
  expect(INDEXED_COMPONENTS).toEqual(INDEXED_POSITIONS.map((i) => COMPONENT_ORDER[i]))
})

// Excluded from the index, not from the tuple: it still hashes with its position and still
// counts toward `matched`. A doubling bucket takes a handful of values, so a posting list keyed
// on one holds a large share of the registry and the walk grows with it.
test('the amount bucket is scored but never indexed', () => {
  expect(COMPONENT_ORDER).toContain('amountBucket')
  expect(INDEXED_COMPONENTS).not.toContain('amountBucket')
})

// The index and the constants no longer partition the tuple: the amount bucket is in neither.
// What must still hold is that nothing indexed is a ledger constant, and nothing indexed is
// outside the tuple — a name belonging to neither set, or to both, is the real hazard.
test('every indexed component is part of the tuple and none is a ledger constant', () => {
  for (const name of INDEXED_COMPONENTS) {
    expect(COMPONENT_ORDER).toContain(name)
    expect(LEDGER_CONSTANT).not.toContain(name)
  }
})
