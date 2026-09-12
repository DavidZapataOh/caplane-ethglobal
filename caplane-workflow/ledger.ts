import { CONFIRMATION_FIELDS, type DebtorConfirmation } from '../claim/attestation'
import { ClaimType } from './abi/frozen'
import { EXPONENT } from '../claim/canonical'

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
	/** Which instrument this is. Absent in envelopes sealed before it existed: defaults to invoice. */
	claimType: number
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

	// The instrument type, defaulted rather than required: every envelope sealed before this existed
	// carries no such field, and refusing those would invalidate work already done. An unsupported
	// value is refused downstream by the derivation, which is where a wrong preimage space would do
	// the damage.
	const claimType = typeof parsed.claimType === 'number' ? parsed.claimType : ClaimType.Invoice

	return {
		...(parsed as unknown as SubmittedClaim),
		claimType,
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
	/** `ACCREC` is a receivable; `ACCPAY` is a bill the organisation owes. Only the first is financeable. */
	Type?: string
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

/**
 * Owed TO the organisation and outstanding. AUTHORISED is approved and awaiting payment; DRAFT is
 * not owed yet.
 *
 * `Type` is the half that was missing and it is not cosmetic: an `ACCPAY` bill — money the
 * organisation owes a supplier — carries a contact, a due date and a live `AmountDue`, so it
 * satisfies every other check identically. Measured against the live tenant, eleven authorised
 * unpaid bills sit in the same book this reads. Financing one advances cash against a liability
 * that no debtor will ever pay into the escrow.
 */
export const isUnpaid = (invoice: Invoice): boolean =>
	invoice.Type === 'ACCREC' && invoice.Status === 'AUTHORISED' && (invoice.AmountDue ?? 0) > 0

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
	minorUnitsOf(invoice.AmountDue, claim.currency) === claim.amountMinor &&
	invoice.CurrencyCode === claim.currency &&
	(invoice.DueDateString ?? '').slice(0, 10) === claim.dueDate

/**
 * The ledger's amount is a JSON double; the claim's is a decimal string of minor units. Scaling
 * by a hardcoded 100 was wrong twice.
 *
 * The exponent is the currency's, not two: JPY, KRW, CLP, ISK and VND have none, and KWD, BHD,
 * JOD and TND have three. A correct JPY claim would never have matched a correct JPY invoice, and
 * the rejection would have read `SourceUnverified` — a statement about the ledger that was false.
 *
 * And the arithmetic is on the decimal text, not on the double. Past 2^53 a double cannot hold
 * the value it was parsed from: 90071992547409.93 becomes …94, so a claim one minor unit LARGER
 * than the ledger holds would have been attested as matching.
 */
export const minorUnitsOf = (amount: number | undefined, currency: string): string | undefined => {
	if (amount === undefined || !Number.isFinite(amount)) return undefined
	const exponent = EXPONENT[currency] ?? 2
	// `toFixed` renders the double's decimal form; the shift is then exact integer text.
	const [whole, fraction = ''] = amount.toFixed(exponent).split('.')
	return (BigInt(whole) * 10n ** BigInt(exponent) + BigInt(fraction.padEnd(exponent, '0') || '0')).toString()
}

/** The screening envelope, as returned: a match count, the lists consulted, and one page. */
export type ScreeningResponse = { total?: number; results?: unknown[] }

/**
 * The count, never the page: `size` caps `results`, and a clean page is not a clean name.
 *
 * Fails CLOSED. `total ?? 0` treated a missing count as zero, so any 200 that was not the shape
 * expected — a schema change, a quota envelope, `{}` — screened the debtor clean and the claim
 * could be recorded. Every other unanswerable read in this system refuses; this was the one that
 * approved, and it is the one where the consequence is a compliance failure rather than a credit
 * one. `undefined` now means unscreened, which the caller must treat as a hit.
 */
export const hasSanctionsHit = (response: ScreeningResponse): boolean | undefined =>
	typeof response.total === 'number' ? response.total > 0 : undefined

/**
 * `btoa` is declared in the SDK's global types and is undefined at runtime: `prepareRuntime`
 * assigns it from a module that does not export it, so the assignment stores undefined and the
 * type checker still sees a function. `Buffer` comes off the same line and does exist.
 */
export const basicAuth = (id: string, secret: string): string =>
	`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`

/**
 * Replaces the claim fields the enclave can derive with the values it actually knows, and refuses
 * the claim outright when it cannot derive them.
 *
 * Three of the seven commitment components were taken from the submitter's JSON and checked
 * against nothing: `issuerTaxId`, `country` and `debtorTaxId`. Since the collision threshold is
 * six of seven, editing any two of them dropped agreement to five, the index read `clear`, and a
 * second lien landed on the same receivable — the double pledge the whole peppered index exists
 * to prevent, defeated by two characters. The claim package already described this control:
 * `issuerTaxId` "comes from the organisation making the submission, which the enclave already
 * knows from the credential it used to read the ledger." It was never implemented.
 *
 * `debtorTaxId` becomes the ledger's own name for the counterparty — the same value the screening
 * call uses, and the one the debtor confirmation's `debtorRef` already commits to.
 *
 * Returns undefined when the invoice carries no contact. That case must not fall back to an empty
 * string: an empty name screens clean on the watchlist and hashes to a publicly known `debtorRef`,
 * so one missing field would have bypassed the sanctions check and the debtor check at once.
 */
export const bindToLedger = (
	claim: SubmittedClaim,
	invoice: Invoice,
	tenantId: string,
	country: string,
): SubmittedClaim | undefined => {
	const contactId = invoice.Contact?.ContactID
	const contactName = invoice.Contact?.Name
	if (contactId === undefined || contactName === undefined || contactName === '') return undefined
	// The country is a property of the organisation, not of the claim, and the invoice does not
	// carry one — so it comes from configuration beside the tenant it describes.
	return { ...claim, debtorTaxId: contactName, issuerTaxId: tenantId, country }
}
