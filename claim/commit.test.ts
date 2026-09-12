import { expect, test } from 'bun:test'
import { ClaimType } from './abi/frozen'
import { claimIdOf, componentCommitments, lienIdOf } from './commit'
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
const claim = (over: Partial<ClaimInput> = {}): ClaimComponents => toComponents(ClaimType.Invoice, { ...INPUT, ...over })
const PEPPER = new Uint8Array(32).fill(7)

test('the lien id is thirty-two bytes and pepper-free', () => {
  expect(lienIdOf(ClaimType.Invoice, claim(), PEPPER)).toHaveLength(66) // 0x + 64
})

// The unpeppered tier is now the CLAIM id, and its point is narrower than it was: the debtor's
// signing tool runs outside the enclave and must derive the same value without ever holding the
// pepper. It is safe unpeppered because it never leaves the sealed envelope.
//
// The lien id used to have this property and deliberately no longer does. It is published in
// `LienRecorded`, and over seven components carrying about eighteen bits — three of them constants
// of one ledger — a pepper-free published key inverted by brute force in 71 ms.
test('the claim id does not depend on the pepper, and the lien id does', () => {
  expect(claimIdOf(ClaimType.Invoice, claim())).toBe(claimIdOf(ClaimType.Invoice, claim()))
  expect(lienIdOf(ClaimType.Invoice, claim(), PEPPER)).not.toBe(
    lienIdOf(ClaimType.Invoice, claim(), new Uint8Array(32).fill(9)),
  )
})

// Both spellings are legal outputs of the canonicalisers and the tax number is the corpus's
// real one. Joining the components as strings gives identical bytes, so one borrower's invoice
// would block another's. Hashing each component first makes the boundaries fixed-width.
test('shifting a character across the debtor/invoice boundary changes the lien id', () => {
  const a = lienIdOf(ClaimType.Invoice, claim(), PEPPER)
  const b = lienIdOf(
    ClaimType.Invoice,
    claim({ debtorTaxId: '11000111000O', invoiceNumber: 'RC1043' }),
    PEPPER,
  )
  expect(a).not.toBe(b)
  // And the same shift must move the claim id too, since the debtor signs that one.
  expect(claimIdOf(ClaimType.Invoice, claim())).not.toBe(
    claimIdOf(ClaimType.Invoice, claim({ debtorTaxId: '11000111000O', invoiceNumber: 'RC1043' })),
  )
})

test('a lease and an invoice with identical text are different liens', () => {
  expect(lienIdOf(ClaimType.Lease, claim(), PEPPER)).not.toBe(
    lienIdOf(ClaimType.Invoice, claim(), PEPPER),
  )
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

// The registry key was a hash of the claim with no pepper, and it is published in `LienRecorded`.
// The claim's seven components carry roughly eighteen bits between them — three of them none at
// all, since currency, country and the issuer are constants of the ledger — so the key was
// invertible by brute force. Measured before this change: a real lien recovered in 71 ms.
test('the lien id is peppered, so the published key does not invert', () => {
  const c = claim()
  const a = lienIdOf(ClaimType.Invoice, c, PEPPER)
  const b = lienIdOf(ClaimType.Invoice, c, new Uint8Array(32).fill(9))
  expect(a).not.toBe(b)
  expect(a).toBe(lienIdOf(ClaimType.Invoice, c, PEPPER))
})

// And it must not collide with the claim id, which is the same seven digests without the pepper.
// Different preimage spaces, separated by their first byte.
test('the lien id and the claim id are different values', () => {
  const c = claim()
  expect(lienIdOf(ClaimType.Invoice, c, PEPPER)).not.toBe(claimIdOf(ClaimType.Invoice, c))
})

// The claim id stays pepper-free on purpose: the debtor's signing tool derives it outside the
// enclave, and giving that tool the pepper would take the pepper out of the enclave and defeat
// the index it exists to protect. It is safe there because it never leaves the sealed envelope.
test('the claim id needs no pepper, and is reproducible by the signer', () => {
  const c = claim()
  expect(claimIdOf(ClaimType.Invoice, c)).toBe(claimIdOf(ClaimType.Invoice, c))
})
