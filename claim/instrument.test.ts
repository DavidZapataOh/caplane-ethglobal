import { expect, test } from 'bun:test'
import { ClaimType } from './abi/frozen'
import { claimIdOf, lienIdOf } from './commit'
import { INSTRUMENTS, instrumentOf, toComponents } from './instrument'

const PEPPER = new Uint8Array(32).fill(7)

const VEHICLE = {
  debtorTaxId: '900123456',
  invoiceNumber: '1HGCM82633A004352',
  amountMinor: '1850000',
  dueDate: '2028-03-31',
  currency: 'USD',
  issuerTaxId: '811004321',
  country: 'US',
}

// Seven positions, not eight. The registry stores bytes32[7], the Solidity constant is 7, and a
// second instrument with a different count is a redeploy plus a storage migration nobody can
// perform on a lien that already exists.
test('every instrument fills exactly seven positions', () => {
  for (const instrument of Object.values(INSTRUMENTS)) {
    expect(instrument.order.length).toBe(7)
    expect(Object.keys(instrument.label).length).toBe(7)
  }
})

// The internal keys are the first instrument's legacy. They enter no preimage, so renaming them
// changes nothing that is hashed and would break test literals across four plans' worth of
// artifacts. What changes per type is what a human is shown.
test('the labels differ where the meaning differs', () => {
  expect(INSTRUMENTS[ClaimType.Invoice]!.label.invoiceNumber).toBe('invoice number')
  expect(INSTRUMENTS[ClaimType.Equipment]!.label.invoiceNumber).toBe('vehicle identification number')
  expect(INSTRUMENTS[ClaimType.Equipment]!.label.issuerTaxId).toBe('secured party')
  expect(INSTRUMENTS[ClaimType.Equipment]!.label.debtorTaxId).toBe('obligor')
})

// Already implemented and never exercised until now: the domain byte is what lets two instruments
// share one registry. The same seven texts under two types must not produce the same key.
test('the same texts under two types never collide', () => {
  const asEquipment = toComponents(ClaimType.Equipment, VEHICLE)
  const asInvoice = toComponents(ClaimType.Invoice, VEHICLE)
  expect(asEquipment).toEqual(asInvoice)
  expect(lienIdOf(ClaimType.Equipment, asEquipment, PEPPER)).not.toBe(
    lienIdOf(ClaimType.Invoice, asInvoice, PEPPER),
  )
  expect(claimIdOf(ClaimType.Equipment, asEquipment)).not.toBe(claimIdOf(ClaimType.Invoice, asInvoice))
})

// A vin is fixed width with a check digit, so canonicalisation loses nothing — which is the whole
// reason its threshold can be exact. If canonicalisation ever trimmed it, that claim stops holding.
test('a vin survives canonicalisation intact', () => {
  const components = toComponents(ClaimType.Equipment, { ...VEHICLE, invoiceNumber: ' 1hgcm8-2633a/004352 ' })
  expect(components.invoiceNumber).toBe('1HGCM82633A004352')
  expect(components.invoiceNumber.length).toBe(17)
})

// An unknown type is a refusal, not a default. Falling back to Invoice would derive a key in the
// wrong preimage space and write a lien nobody could ever find again.
test('an unknown claim type is refused', () => {
  expect(() => toComponents(ClaimType.Unset, VEHICLE)).toThrow(/claim type/)
  expect(() => toComponents(99, VEHICLE)).toThrow(/claim type/)
  expect(() => instrumentOf(ClaimType.Lease)).toThrow(/claim type/)
})

// The order is the hash index. One swap and every existing lien becomes unfindable, so the order
// is pinned per instrument rather than trusted to stay put.
test('both instruments hash the same seven positions in the same order', () => {
  expect(INSTRUMENTS[ClaimType.Invoice]!.order).toEqual(INSTRUMENTS[ClaimType.Equipment]!.order)
})
