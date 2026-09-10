/**
 * Shapes follow the published accounting OpenAPI schema: money fields are `number`
 * (`format: double`), and the invoice object declares no required properties, so every
 * field is optional on the wire.
 */
export type Invoice = { Status?: string; AmountDue?: number; AmountPaid?: number }

/** Owed and outstanding. AUTHORISED is approved and awaiting payment; DRAFT is not owed yet. */
export const isUnpaid = (invoice: Invoice): boolean =>
  invoice.Status === 'AUTHORISED' && (invoice.AmountDue ?? 0) > 0

export const invoiceIdOf = (body: { Invoices?: Array<{ InvoiceID?: string }> }): string | undefined =>
  body.Invoices?.[0]?.InvoiceID

/**
 * `size` caps how many matches the page carries, so a non-empty result set is a hit
 * whatever the upstream match count is.
 */
export const hasSanctionsHit = (response: { results?: unknown[] }): boolean =>
  (response.results?.length ?? 0) > 0
