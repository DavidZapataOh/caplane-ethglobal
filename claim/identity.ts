import { canonicalText } from './canonical'
import { ClaimError } from './schema'

export type IdentitySource = 'taxNumber' | 'name'

/**
 * A tax number when the ledger carries one, the canonical name otherwise. The source travels
 * with the value because the two do not discriminate equally — a tax number is unique, a name
 * is written three ways — and a measurement that mixed them without saying so would report a
 * rate for a population it never describes.
 *
 * Eighty-two of this ledger's eighty-three contacts have no tax number, so the fallback is not
 * an edge case here: it is what makes a corpus possible at all.
 */
export const debtorIdentity = (contact: {
  Name?: string | undefined
  TaxNumber?: string | null | undefined
}): { value: string; source: IdentitySource } => {
  const fromTax = canonicalText(contact.TaxNumber ?? '')
  if (fromTax !== '') return { value: fromTax, source: 'taxNumber' }

  const fromName = canonicalText(contact.Name ?? '')
  if (fromName !== '') return { value: fromName, source: 'name' }

  throw new ClaimError('debtorTaxId', 'contact has no identity: neither tax number nor name')
}
