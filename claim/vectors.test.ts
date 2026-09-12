import { expect, test } from 'bun:test'
import { ClaimType } from './abi/frozen'
import { claimIdOf, componentCommitments, lienIdOf } from './commit'
import type { ClaimComponents } from './schema'
import { VECTORS } from './vectors'

const components = VECTORS.invoice.components as unknown as ClaimComponents
const testPepper = new Uint8Array(VECTORS.testPepper)

// A vector file regenerated whenever the code changes proves nothing. These are literals: if a
// derivation moves, they fail, and that failure is the whole point.
test('the recorded claim id still derives', () => {
  expect(claimIdOf(ClaimType.Invoice, components)).toBe(VECTORS.invoice.claimId)
})

// The registry key is now peppered, so it has a vector only under the published test pepper —
// and it must differ from the claim id, which is the same seven digests without one. The two were
// the same value until the published key was shown to invert by brute force.
test('the peppered lien id derives, and is not the claim id', () => {
  const lienId = lienIdOf(ClaimType.Invoice, components, testPepper)
  expect(lienId).toBe(VECTORS.invoice.lienIdUnderTestPepper)
  expect(lienId).not.toBe(VECTORS.invoice.claimId)
})

// The peppered tier needs a pepper to have a vector, and the production pepper never leaves
// the enclave. The vector uses a published test pepper and says so.
test('the recorded component commitments still derive under the test pepper', () => {
  expect(componentCommitments(ClaimType.Invoice, components, testPepper)).toEqual([
    ...VECTORS.invoice.commitments,
  ])
})
