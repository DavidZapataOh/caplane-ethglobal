import { expect, test } from 'bun:test'
import { ClaimType } from './abi/frozen'
import { componentCommitments, lienIdOf } from './commit'
import type { ClaimComponents } from './schema'
import { VECTORS } from './vectors'

const components = VECTORS.invoice.components as unknown as ClaimComponents
const testPepper = new Uint8Array(VECTORS.testPepper)

// A vector file regenerated whenever the code changes proves nothing. These are literals: if a
// derivation moves, they fail, and that failure is the whole point.
test('the recorded lien id still derives', () => {
  expect(lienIdOf(ClaimType.Invoice, components)).toBe(VECTORS.invoice.lienId)
})

// The peppered tier needs a pepper to have a vector, and the production pepper never leaves
// the enclave. The vector uses a published test pepper and says so.
test('the recorded component commitments still derive under the test pepper', () => {
  expect(componentCommitments(ClaimType.Invoice, components, testPepper)).toEqual([
    ...VECTORS.invoice.commitments,
  ])
})
