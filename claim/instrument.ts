import { ClaimType } from './abi/frozen'
import {
  canonicalAmountBucket,
  canonicalCountry,
  canonicalCurrency,
  canonicalDate,
  canonicalText,
} from './canonical'
import { COMPONENT_ORDER, ClaimError, type ClaimComponents, type ClaimInput, type ComponentName } from './schema'

/**
 * What a claim type changes, and what it does not.
 *
 * It does not change the positions: those are storage layout on chain — `bytes32[7]` behind a
 * constant of seven — so a second instrument with a different count is a redeploy and a migration
 * nobody can perform on a lien that already exists. It does not change the internal keys either:
 * they enter no preimage, so renaming them would alter nothing that is hashed while breaking test
 * literals across four plans' worth of artifacts. The names below are the first instrument's
 * legacy, and position 1 holding a vehicle identification number is exactly the point — the tuple
 * is instrument-shaped, not invoice-shaped.
 *
 * What it changes is the words a human is shown, how many components have to agree, and — outside
 * this module — which real source attests the claim.
 */
export type Instrument = {
  order: readonly ComponentName[]
  label: Record<ComponentName, string>
  threshold: number
}

const INVOICE_LABELS: Record<ComponentName, string> = {
  debtorTaxId: 'debtor',
  invoiceNumber: 'invoice number',
  amountBucket: 'amount bucket',
  dueDate: 'due date',
  currency: 'currency',
  issuerTaxId: 'issuer',
  country: 'jurisdiction',
}

const VEHICLE_LABELS: Record<ComponentName, string> = {
  debtorTaxId: 'obligor',
  invoiceNumber: 'vehicle identification number',
  amountBucket: 'advance bucket',
  dueDate: 'maturity',
  currency: 'currency',
  issuerTaxId: 'secured party',
  country: 'jurisdiction',
}

export const INSTRUMENTS: Record<number, Instrument> = {
  /** Six is measured: 903 pairs of real invoices from one ledger, one false match at six of seven. */
  [ClaimType.Invoice]: { order: COMPONENT_ORDER, threshold: 6, label: INVOICE_LABELS },
  /**
   * Seven is structural, and the reason is a fleet. Two vehicles financed by the same creditor to
   * the same obligor on the same terms agree on six and differ only in the vin, so an inherited six
   * would refuse the second truck as a double pledge of the first. Exactness is safe here because a
   * vin is seventeen fixed characters with a check digit and canonicalisation loses nothing, so the
   * legitimate reformatting that forced six down for invoices does not exist for this type.
   */
  [ClaimType.Equipment]: { order: COMPONENT_ORDER, threshold: 7, label: VEHICLE_LABELS },
}

/** An unknown type is refused. Falling back would derive a key in the wrong preimage space. */
export const instrumentOf = (claimType: number): Instrument => {
  const found = INSTRUMENTS[claimType]
  if (found === undefined) throw new ClaimError('debtorTaxId', `unsupported claim type ${claimType}`)
  return found
}

const nonEmpty = (name: ComponentName, value: string): string => {
  if (value === '') throw new ClaimError(name, 'canonicalises to nothing')
  return value
}

/**
 * The claim as seven canonical strings, in the order their index takes when hashed.
 *
 * The type is validated before anything is canonicalised, so an unsupported one fails on the type
 * rather than somewhere downstream on a field.
 */
export const toComponents = (claimType: number, input: ClaimInput): ClaimComponents => {
  instrumentOf(claimType)
  return {
    debtorTaxId: nonEmpty('debtorTaxId', canonicalText(input.debtorTaxId)),
    invoiceNumber: nonEmpty('invoiceNumber', canonicalText(input.invoiceNumber)),
    amountBucket: canonicalAmountBucket(input.amountMinor, input.currency),
    dueDate: canonicalDate(input.dueDate),
    currency: canonicalCurrency(input.currency),
    issuerTaxId: nonEmpty('issuerTaxId', canonicalText(input.issuerTaxId)),
    country: canonicalCountry(input.country),
  }
}
