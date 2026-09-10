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

/** The screening envelope, as returned: a match count, the lists consulted, and one page. */
export type ScreeningResponse = { total?: number; sources?: unknown[]; results?: unknown[] }

/**
 * Reads the match count, never the page. `size` caps `results`, so a query with more matches
 * than the page holds would read clean off the array — a false negative, the unsafe direction.
 */
export const hasSanctionsHit = (response: ScreeningResponse): boolean => (response.total ?? 0) > 0
