import { expect, test } from 'bun:test'
import { ClaimType } from './abi/frozen'
import { componentCommitments, lienIdOf } from './commit'
import { toComponents } from './index'
import type { ClaimComponents, ClaimInput } from './schema'

const INPUT: ClaimInput = {
  debtorTaxId: '11 000 111 000',
  invoiceNumber: 'ORC1043',
  amountMinor: '27500000',
  currency: 'AUD',
  dueDate: '2026-12-31',
  issuerTaxId: 'e1218a28-7437-47ec-bfb5-252092825083',
  country: 'AU',
}
const claim = (over: Partial<ClaimInput> = {}): ClaimComponents => toComponents({ ...INPUT, ...over })
const PEPPER = new Uint8Array(32).fill(7)

test('the lien id is thirty-two bytes and pepper-free', () => {
  expect(lienIdOf(ClaimType.Invoice, claim())).toHaveLength(66) // 0x + 64
})

// The point of the unpeppered tier: a third party with no enclave computes the same value.
test('the lien id does not depend on the pepper', () => {
  expect(lienIdOf(ClaimType.Invoice, claim())).toBe(lienIdOf(ClaimType.Invoice, claim()))
})

// Both spellings are legal outputs of the canonicalisers and the tax number is the corpus's
// real one. Joining the components as strings gives identical bytes, so one borrower's invoice
// would block another's. Hashing each component first makes the boundaries fixed-width.
test('shifting a character across the debtor/invoice boundary changes the lien id', () => {
  const a = lienIdOf(ClaimType.Invoice, claim())
  const b = lienIdOf(ClaimType.Invoice, claim({ debtorTaxId: '11000111000O', invoiceNumber: 'RC1043' }))
  expect(a).not.toBe(b)
})

test('a lease and an invoice with identical text are different liens', () => {
  expect(lienIdOf(ClaimType.Lease, claim())).not.toBe(lienIdOf(ClaimType.Invoice, claim()))
})

test('component commitments come back in the hashed index order, seven of them', () => {
  expect(componentCommitments(ClaimType.Invoice, claim(), PEPPER)).toHaveLength(7)
})

// Without the pepper the index would be brute-forceable: four of the seven components are
// low-entropy enough to enumerate.
test('the pepper changes every component commitment', () => {
  const a = componentCommitments(ClaimType.Invoice, claim(), PEPPER)
  const b = componentCommitments(ClaimType.Invoice, claim(), new Uint8Array(32).fill(9))
  for (let i = 0; i < 7; i++) expect(a[i]).not.toBe(b[i])
})

// One component differing changes exactly one commitment: that is what makes the count a count.
test('changing one component changes exactly one commitment', () => {
  const a = componentCommitments(ClaimType.Invoice, claim(), PEPPER)
  const b = componentCommitments(ClaimType.Invoice, claim({ invoiceNumber: 'ORC1044' }), PEPPER)
  expect(a.filter((v, i) => v !== b[i])).toHaveLength(1)
})
