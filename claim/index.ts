export * from './schema'
export * from './canonical'
export * from './match'

import {
  canonicalAmountBucket,
  canonicalCountry,
  canonicalCurrency,
  canonicalDate,
  canonicalText,
} from './canonical'
import { ClaimError, type ClaimComponents, type ClaimInput, type ComponentName } from './schema'

/**
 * A component that canonicalises to nothing is refused here rather than tolerated downstream.
 * On-chain an empty component hashes to a perfectly ordinary commitment and compares equal to
 * any other empty one, so a claim made of punctuation would match another on every component
 * at once. Refusing at the door is the only place that cannot diverge from the chain.
 */
const nonEmpty = (name: ComponentName, value: string): string => {
  if (value === '') throw new ClaimError(name, 'canonicalises to nothing')
  return value
}

/** The claim as seven canonical strings, in the order their index takes when hashed. */
export const toComponents = (input: ClaimInput): ClaimComponents => ({
  debtorTaxId: nonEmpty('debtorTaxId', canonicalText(input.debtorTaxId)),
  invoiceNumber: nonEmpty('invoiceNumber', canonicalText(input.invoiceNumber)),
  amountBucket: canonicalAmountBucket(input.amountMinor, input.currency),
  dueDate: canonicalDate(input.dueDate),
  currency: canonicalCurrency(input.currency),
  issuerTaxId: nonEmpty('issuerTaxId', canonicalText(input.issuerTaxId)),
  country: canonicalCountry(input.country),
})
