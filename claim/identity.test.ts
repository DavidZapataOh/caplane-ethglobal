import { expect, test } from 'bun:test'
import { debtorIdentity } from './identity'

test('a tax number is the identity when the ledger has one', () => {
  expect(debtorIdentity({ Name: 'Bayside Club', TaxNumber: '11 000 111 000' })).toEqual({
    value: '11000111000',
    source: 'taxNumber',
  })
})

// Eighty-two of eighty-three contacts in the real ledger have none. A lender does not give up
// there; it identifies the debtor by name, and accepts that a name discriminates less well.
test('the canonical name is the identity when there is no tax number', () => {
  expect(debtorIdentity({ Name: 'Maddox Publishing Group', TaxNumber: null })).toEqual({
    value: 'MADDOXPUBLISHINGGROUP',
    source: 'name',
  })
})

test('an empty tax number is treated as absent, not as an identity', () => {
  expect(debtorIdentity({ Name: 'Acme', TaxNumber: '   ' }).source).toBe('name')
})

// A contact with neither cannot be a debtor at all, and saying so loudly beats producing a
// claim whose identity component is empty.
test('a contact with neither is refused', () => {
  expect(() => debtorIdentity({ Name: '', TaxNumber: null })).toThrow(/no identity/)
})
