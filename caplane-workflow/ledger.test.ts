import { readFileSync } from 'node:fs'
import { expect, test } from 'bun:test'
import {
	basicAuth,
	bindToLedger,
	decodeClaim,
	hasSanctionsHit,
	invoiceOf,
	invoiceQuery,
	isUnpaid,
	matchesClaim,
} from './ledger'

const CLAIM = {
	debtorTaxId: 'Bayside Club',
	invoiceNumber: 'ORC1043',
	amountMinor: '27500000',
	currency: 'AUD',
	dueDate: '2026-12-31',
	issuerTaxId: 'e1218a28-7437-47ec-bfb5-252092825083',
	country: 'AU',
}

// The sealed plaintext is the seven claim fields plus the debtor's confirmation and its signature.
// The two are not optional: a document without them is not a claim this system approves, and
// accepting one would make every check above it decorative.
const CONFIRMATION = {
	creditor: '0x86ec9f04485db066cf155353f15eef356ae90253',
	debtor: '0x3325a78425f17a7e487eb5666b2bfd93abb06c70',
	claimId: `0x${'11'.repeat(32)}`,
	invoiceNumber: 'ORC1043',
	currency: 'AUD',
	amountMinor: '27500000',
	dueDate: '2026-12-31',
	debtorRef: `0x${'22'.repeat(32)}`,
	expiresAtBlock: '61700000',
}
const TENANT = 'e1218a28-7437-47ec-bfb5-252092825083'
/** The shape the ledger actually returns, measured against the live tenant. */
const INVOICE = {
	Type: 'ACCREC',
	Status: 'AUTHORISED',
	AmountDue: 275000,
	CurrencyCode: 'AUD',
	DueDateString: '2026-12-31T00:00:00',
	Contact: { ContactID: '3e776c4b-ea9e-4bb1-96be-6b0c7a71a37f', Name: 'Bayside Club' },
}
const SIGNATURE = `0x${'ab'.repeat(65)}`
const DOCUMENT = { ...CLAIM, confirmation: CONFIRMATION, signature: SIGNATURE }

// The plaintext format is frozen by this module: JSON of the seven submitted fields. A decoder
// that accepts a partial document would let a claim omit the amount and match anything.
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

test('a claim missing any of the seven fields is refused', () => {
	for (const field of Object.keys(CLAIM)) {
		const short: Record<string, unknown> = { ...DOCUMENT }
		delete short[field]
		expect(() => decodeClaim(encode(short))).toThrow()
	}
	expect(decodeClaim(encode(DOCUMENT)).invoiceNumber).toBe('ORC1043')
})

// Whitespace is not part of the format: the tool that seals writes whatever the document looks
// like on disk, and a decoder that only took the compact form would open it and then die.
test('a pretty-printed document decodes', () => {
	expect(decodeClaim(encode(DOCUMENT)).amountMinor).toBe(
		decodeClaim(new TextEncoder().encode(JSON.stringify(DOCUMENT, null, 2))).amountMinor,
	)
})

// A document with no confirmation is not a claim this system approves. The seven string fields
// cannot validate it: `confirmation` is an object, so the check that covers them passes it through.
test('a claim with no confirmation is refused, not ignored', () => {
	expect(() => decodeClaim(encode(CLAIM))).toThrow()
	expect(() => decodeClaim(encode({ ...CLAIM, signature: SIGNATURE }))).toThrow()
	expect(() => decodeClaim(encode({ ...CLAIM, confirmation: CONFIRMATION }))).toThrow()
	for (const field of Object.keys(CONFIRMATION)) {
		const short: Record<string, unknown> = { ...CONFIRMATION }
		delete short[field]
		expect(() => decodeClaim(encode({ ...DOCUMENT, confirmation: short }))).toThrow()
	}
	expect(decodeClaim(encode(DOCUMENT)).signature).toBe(SIGNATURE)
})

// JSON has no bigint, so the two numeric fields travel as text and are converted at the door.
// Left as strings they would compare unequal to every amount and every block height.
test('the numeric confirmation fields arrive as bigints', () => {
	const { confirmation } = decodeClaim(encode(DOCUMENT))
	expect(confirmation.amountMinor).toBe(27_500_000n)
	expect(confirmation.expiresAtBlock).toBe(61_700_000n)
})

// The number reaches the clause inside double quotes and the ledger answers 400 to one inside it,
// measured. An allowlist refuses; escaping is something a later edit forgets.
test('an invoice number that could close the clause is refused', () => {
	expect(() => invoiceQuery('OR"C1043')).toThrow()
	expect(() => invoiceQuery('ORC 1043')).toThrow()
	expect(() => invoiceQuery('')).toThrow()
	expect(invoiceQuery('ORC-1043')).toBe('InvoiceNumber=="ORC-1043"')
	expect(invoiceQuery('ORC1043')).toBe('InvoiceNumber=="ORC1043"')
})

// An invoice that does not exist is a 200 with an empty array, not a 404. Reading existence off
// the status code would call every missing invoice present.
test('existence is the array, not the status', () => {
	expect(invoiceOf({ Invoices: [] })).toBeUndefined()
	expect(invoiceOf({})).toBeUndefined()
	expect(invoiceOf({ Invoices: [{ InvoiceNumber: 'ORC1043' }] })?.InvoiceNumber).toBe('ORC1043')
})

// AUTHORISED is approved and awaiting payment; DRAFT is not owed yet. Money is a JSON number.
test('only an approved receivable with a live balance is unpaid', () => {
	const r = { Type: 'ACCREC' }
	expect(isUnpaid({ ...r, Status: 'AUTHORISED', AmountDue: 275000 })).toBe(true)
	expect(isUnpaid({ ...r, Status: 'AUTHORISED', AmountDue: 0 })).toBe(false)
	expect(isUnpaid({ ...r, Status: 'DRAFT', AmountDue: 275000 })).toBe(false)
	expect(isUnpaid({ ...r, Status: 'AUTHORISED' })).toBe(false)
})

// Without this the enclave attests that *an* invoice exists, not that the claimed one does: a
// submitter could pledge a real invoice number against someone else's amount and due date.
test('the ledger invoice must be the claimed invoice', () => {
	const real = {
		Status: 'AUTHORISED',
		AmountDue: 275000,
		CurrencyCode: 'AUD',
		DueDateString: '2026-12-31T00:00:00',
	}
	expect(matchesClaim(real, CLAIM)).toBe(true)
	expect(matchesClaim({ ...real, AmountDue: 13200 }, CLAIM)).toBe(false)
	expect(matchesClaim({ ...real, DueDateString: '2027-06-30T00:00:00' }, CLAIM)).toBe(false)
	expect(matchesClaim({ ...real, CurrencyCode: 'USD' }, CLAIM)).toBe(false)
	expect(matchesClaim({ Status: 'AUTHORISED' }, CLAIM)).toBe(false)
})

// `size` caps `results`, so a name with four hundred matches returns a page of three. Reading the
// array instead of the count would call a sanctioned counterparty clean.
test('a hit is the count, never the page', () => {
	expect(hasSanctionsHit({ total: 400, results: [] })).toBe(true)
	expect(hasSanctionsHit({ total: 0, results: [] })).toBe(false)
})

// A 200 whose body carries no count — a schema change, a quota envelope, `{}` — used to read as
// zero and screen the debtor clean. Every other unanswerable read in this system refuses; this was
// the one that approved, and it is the one where the consequence is a compliance failure.
test('an answer that is not a count is undecided, never clean', () => {
	expect(hasSanctionsHit({})).toBeUndefined()
	expect(hasSanctionsHit({ results: [] })).toBeUndefined()
	expect(hasSanctionsHit({ total: undefined })).toBeUndefined()
	// and the caller must treat undecided as unscreened
	expect(hasSanctionsHit({}) === false).toBe(false)
})

// Four globals the SDK declares and the enclave does not have: `prepareRuntime` assigns them from
// modules that do not export them, so the assignment stores undefined and the type checker sees a
// function. Only `Buffer`, from the same line, survives. `tsc` passes on all five.
test('the enclave builds credentials without the absent globals', () => {
	expect(basicAuth('id', 'secret')).toBe('Basic aWQ6c2VjcmV0')
	const source = readFileSync('./ledger.ts', 'utf8')
	for (const absent of ['btoa(', 'atob(', 'new URL(', 'URLSearchParams']) {
		expect(source).not.toContain(absent)
	}
})

// Reading the due date off `DueDate` would need `Date`, which the determinism validator rejects
// and which the enclave's own guidance bans. `DueDateString` is ISO on the wire.
test('nothing on this path reaches for a clock', () => {
	const source = readFileSync('./ledger.ts', 'utf8')
	expect(source).not.toMatch(/new Date\(|Date\.parse|Date\.now/)
})

// --- what the enclave must derive rather than believe -----------------------------

// Three of the seven commitment components were read straight out of the submitter's JSON and
// checked against nothing. Changing any TWO drops agreement to 5 of 7, below the threshold, so
// the collision index reads `clear` and a second lien lands on the same receivable. The design
// note in the claim package already said `issuerTaxId` "comes from the organisation making the
// submission, which the enclave already knows from the credential it used to read the ledger" —
// this is that control, finally implemented.
test('the enclave substitutes the fields it can derive, ignoring what the claim says', () => {
	const hostile = { ...CLAIM, issuerTaxId: 'QQ', country: 'ZZ', debtorTaxId: 'Anything At All' }
	const bound = bindToLedger(hostile, INVOICE, TENANT, 'AU')
	expect(bound.issuerTaxId).toBe(TENANT)
	expect(bound.country).toBe(CLAIM.country)
	expect(bound.debtorTaxId).toBe('Bayside Club')
})

// And the substitution must be what closes the evasion: two claims differing only in the fields
// the submitter controls must bind to the same components.
test('a claim edited in the free fields binds identically', () => {
	const a = bindToLedger(CLAIM, INVOICE, TENANT, 'AU')
	const b = bindToLedger(
		{ ...CLAIM, issuerTaxId: 'QQ', country: 'ZZ', debtorTaxId: 'Anything At All' },
		INVOICE,
		TENANT,
		'AU',
	)
	expect(b).toEqual(a)
})

// An invoice with no contact cannot bind a debtor, and must not fall back to a constant: the
// empty string screens clean on the watchlist and hashes to a publicly known debtorRef.
test('an invoice without a contact cannot be bound', () => {
	expect(bindToLedger(CLAIM, { Status: 'AUTHORISED' }, TENANT, 'AU')).toBeUndefined()
	expect(bindToLedger(CLAIM, { Contact: { ContactID: 'x' } }, TENANT, 'AU')).toBeUndefined()
})

// Xero's ACCPAY is a bill the organisation OWES. It carries a contact, a due date and a live
// AmountDue, so it satisfies every other check identically. Measured against the live tenant:
// eleven authorised unpaid bills sit in the book this workflow reads.
test('only a receivable is financeable, never a payable', () => {
	expect(isUnpaid({ Type: 'ACCREC', Status: 'AUTHORISED', AmountDue: 275000 })).toBe(true)
	expect(isUnpaid({ Type: 'ACCPAY', Status: 'AUTHORISED', AmountDue: 132 })).toBe(false)
	expect(isUnpaid({ Status: 'AUTHORISED', AmountDue: 275000 })).toBe(false)
})

// The ledger's amount is a JSON double and the claim's is a decimal string. Comparing via
// `x * 100` is wrong twice: it hardcodes a two-digit exponent that JPY and eight other currencies
// do not have, and past 2^53 it compares against a value the double cannot even represent.
test('amounts compare as integers, at the currency exponent', () => {
	const real = { Type: 'ACCREC', Status: 'AUTHORISED', AmountDue: 275000, CurrencyCode: 'AUD',
		DueDateString: '2026-12-31T00:00:00' }
	expect(matchesClaim(real, CLAIM)).toBe(true)
	// JPY has no minor units: ¥50,000 is 50000 minor units, not 5000000.
	const jpy = { ...real, AmountDue: 50000, CurrencyCode: 'JPY' }
	const jpyClaim = { ...CLAIM, currency: 'JPY', amountMinor: '50000' }
	expect(matchesClaim(jpy, jpyClaim)).toBe(true)
	expect(matchesClaim(jpy, { ...jpyClaim, amountMinor: '5000000' })).toBe(false)
})
