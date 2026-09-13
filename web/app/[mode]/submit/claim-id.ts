import { ClaimType } from '../../../../claim/abi/frozen'
import { claimIdOf } from '../../../../claim/commit'
import { toComponents } from '../../../../claim/index'

/** What the enclave substitutes into a claim before it derives anything from it. */
export type LedgerIdentity = { tenantId: string; country: string }

export type InvoiceFields = {
  invoiceNumber: string
  amountMinor: string
  currency: string
  dueDate: string
}

/**
 * The identity the debtor is asked to sign over.
 *
 * Three of the seven components are not the submitter's to state: the enclave replaces the debtor
 * with the ledger's own name for the contact, the issuer with the tenant it read the ledger
 * through, and the country with the one configured beside that tenant. A commitment derived from
 * anything else is one the enclave cannot arrive at, whatever the debtor signed.
 */
export const confirmationClaimId = (
  invoice: InvoiceFields,
  debtorName: string,
  ledger: LedgerIdentity,
): `0x${string}` =>
  claimIdOf(
    ClaimType.Invoice,
    toComponents(ClaimType.Invoice, {
      debtorTaxId: debtorName,
      invoiceNumber: invoice.invoiceNumber,
      amountMinor: invoice.amountMinor,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      issuerTaxId: ledger.tenantId,
      country: ledger.country,
    }),
  )
