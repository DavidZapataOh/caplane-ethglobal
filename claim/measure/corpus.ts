#!/usr/bin/env bun
import { ClaimType } from '../abi/frozen'
import { debtorIdentity, type IdentitySource } from '../identity'
import { toComponents } from '../index'
import type { ClaimComponents } from '../schema'

/**
 * Builds the measurement corpus from invoices already read out of the ledger.
 *
 * Provenance travels with every entry. Which invoices this project created is answered by the
 * provider — a query flag — rather than by guessing from dates or names, and how each debtor
 * was identified is recorded because a tax number and a name do not discriminate equally.
 *
 * The amount is the invoice's face value, not its outstanding balance. A claim is the same
 * claim before and after it is paid; most of this ledger's receivables carry a zero balance
 * and would otherwise be refused as non-positive amounts.
 */
export type MeasuredClaim = {
  invoiceNumber: string
  components: ClaimComponents
  identitySource: IdentitySource
  seededByUs: boolean
}

type Invoice = {
  InvoiceNumber?: string
  Total?: number
  DueDateString?: string
  CurrencyCode?: string
  Contact?: { ContactID?: string; Name?: string }
}
type Contact = { ContactID?: string; Name?: string; TaxNumber?: string | null }

const minorUnits = (total: number): string => String(Math.round(total * 100))

export const buildCorpus = (
  invoices: Invoice[],
  contacts: Contact[],
  ours: Set<string>,
  issuerTaxId: string,
  country: string,
): MeasuredClaim[] => {
  const byId = new Map(contacts.map((c) => [c.ContactID ?? '', c]))
  const out: MeasuredClaim[] = []

  for (const invoice of invoices) {
    const number = invoice.InvoiceNumber ?? ''
    const contact = byId.get(invoice.Contact?.ContactID ?? '') ?? { Name: invoice.Contact?.Name }
    const identity = debtorIdentity(contact)

    out.push({
      invoiceNumber: number,
      components: toComponents(ClaimType.Invoice, {
        debtorTaxId: identity.value,
        invoiceNumber: number,
        amountMinor: minorUnits(invoice.Total ?? 0),
        currency: invoice.CurrencyCode ?? '',
        dueDate: (invoice.DueDateString ?? '').slice(0, 10),
        issuerTaxId,
        country,
      }),
      identitySource: identity.source,
      seededByUs: ours.has(number),
    })
  }
  return out
}
