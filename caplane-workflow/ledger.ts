import { CONFIRMATION_FIELDS, type DebtorConfirmation } from '../claim/attestation'

/**
 * What the sealed plaintext holds, after the twenty bytes naming the authorized submitter: the
 * seven submitted fields as JSON, plus the debtor's confirmation and its signature. Raw, as the
 * submitter wrote them — not the canonical text the commitment hashes, which strips everything
 * that is not a letter or a number and would make every multi-word name unusable against a third
 * party.
 *
 * The confirmation travels inside the envelope because it is evidence the creditor brings, not
 * something the protocol waits for. Collecting it before submission is what removes the second
 * execution entirely: nothing has to survive between runs, and no human has to answer inside a
 * five-minute timeout.
 */
export type SubmittedClaim = {
	debtorTaxId: string
	invoiceNumber: string
	amountMinor: string
	currency: string
	dueDate: string
	issuerTaxId: string
	country: string
	confirmation: DebtorConfirmation
	signature: string
}

const FIELDS = [
	'debtorTaxId',
	'invoiceNumber',
	'amountMinor',
	'currency',
	'dueDate',
	'issuerTaxId',
	'country',
] as const

/**
 * A document short of any field would verify against whatever the ledger happened to return.
 *
 * The confirmation cannot be validated by the check that covers the seven: it is an object, so
 * `typeof === 'string'` passes it straight through. Its fields are checked by name, and the two
 * numeric ones are converted here — JSON has no bigint, so they travel as text, and left as text
 * they would compare unequal to every amount and every block height without anything erroring.
 */
export const decodeClaim = (bytes: Uint8Array): SubmittedClaim => {
	const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>
	for (const field of FIELDS) {
		if (typeof parsed[field] !== 'string') throw new Error(`claim is missing ${field}`)
	}
	if (typeof parsed.signature !== 'string') throw new Error('claim is missing signature')

	const confirmation = parsed.confirmation
	if (typeof confirmation !== 'object' || confirmation === null) {
		throw new Error('claim is missing confirmation')
	}
	const fields = confirmation as Record<string, unknown>
	for (const field of CONFIRMATION_FIELDS) {
		if (typeof fields[field] !== 'string') throw new Error(`confirmation is missing ${field}`)
	}

	return {
		...(parsed as unknown as SubmittedClaim),
		confirmation: {
			...(confirmation as unknown as DebtorConfirmation),
			amountMinor: BigInt(fields.amountMinor as string),
			expiresAtBlock: BigInt(fields.expiresAtBlock as string),
		},
	}
}

/**
 * The number reaches the query clause inside double quotes, and the ledger answers 400 to one
 * that carries a quote — measured. This refuses anything outside the shape a ledger assigns,
 * rather than escaping and trusting every later edit to keep doing it.
 */
export const invoiceQuery = (number: string): string => {
	if (!/^[A-Za-z0-9][A-Za-z0-9._\-/]{0,49}$/.test(number)) {
		throw new Error('invoice number is not a ledger reference')
	}
	return `InvoiceNumber=="${number}"`
}

/**
 * Shapes follow the published accounting OpenAPI schema: money is `number` (`format: double`),
 * and the invoice object declares no required properties, so every field is optional on the wire.
 */
export type Invoice = {
	InvoiceNumber?: string
	Status?: string
	AmountDue?: number
	CurrencyCode?: string
	DueDateString?: string
	// `ContactID` is the ledger's own stable key for the counterparty, and it is what the debtor
	// confirmation points at. The embedded contact carries the id and the name and nothing else —
	// no email, no tax number — so identifying the debtor any further would cost the fifth call.
	Contact?: { ContactID?: string; Name?: string }
}

/** A missing invoice is a 200 with an empty array. The status code says nothing about existence. */
export const invoiceOf = (body: { Invoices?: Invoice[] }): Invoice | undefined => body.Invoices?.[0]

/** Owed and outstanding. AUTHORISED is approved and awaiting payment; DRAFT is not owed yet. */
export const isUnpaid = (invoice: Invoice): boolean =>
	invoice.Status === 'AUTHORISED' && (invoice.AmountDue ?? 0) > 0

/**
 * That the ledger holds *an* invoice under this number is not what is being attested; that it
 * holds *the claimed* one is. Without this a submitter pledges a real number against someone
 * else's amount and due date.
 *
 * `AmountDue` is the live balance, not the invoiced total: for an invoice never paid they agree,
 * for a partly paid one they do not, and what can be pledged is what is left to collect.
 *
 * `DueDateString` is ISO on the wire; `DueDate` is a Microsoft JSON date whose reading would need
 * `Date`, which the determinism validator rejects. Amounts are major units on the wire and minor
 * units in the claim, compared as text because that is how the claim carries them and how the
 * commitment hashes them.
 */
export const matchesClaim = (invoice: Invoice, claim: SubmittedClaim): boolean =>
	Math.round((invoice.AmountDue ?? 0) * 100).toString() === claim.amountMinor &&
	invoice.CurrencyCode === claim.currency &&
	(invoice.DueDateString ?? '').slice(0, 10) === claim.dueDate

/** The screening envelope, as returned: a match count, the lists consulted, and one page. */
export type ScreeningResponse = { total?: number; results?: unknown[] }

/** The count, never the page: `size` caps `results`, and a clean page is not a clean name. */
export const hasSanctionsHit = (response: ScreeningResponse): boolean => (response.total ?? 0) > 0

/**
 * `btoa` is declared in the SDK's global types and is undefined at runtime: `prepareRuntime`
 * assigns it from a module that does not export it, so the assignment stores undefined and the
 * type checker still sees a function. `Buffer` comes off the same line and does exist.
 */
export const basicAuth = (id: string, secret: string): string =>
	`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`
