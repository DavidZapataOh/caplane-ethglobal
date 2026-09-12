import { readFileSync } from 'node:fs'
import { expect, test } from 'bun:test'
import {
	basicAuth,
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

// The plaintext format is frozen by this module: JSON of the seven submitted fields. A decoder
// that accepts a partial document would let a claim omit the amount and match anything.
test('a claim missing any of the seven fields is refused', () => {
	for (const field of Object.keys(CLAIM)) {
		const short: Record<string, string> = { ...CLAIM }
		delete short[field]
		expect(() => decodeClaim(new TextEncoder().encode(JSON.stringify(short)))).toThrow()
	}
	expect(decodeClaim(new TextEncoder().encode(JSON.stringify(CLAIM))).invoiceNumber).toBe('ORC1043')
})

// The envelope that is already on chain carries the document pretty-printed with a trailing
// newline. A decoder that only accepted the compact form would open it and then die.
test('the document on chain decodes', () => {
	const onChain = readFileSync('../claim/fixtures/demo-claim.json', 'utf8')
	expect(decodeClaim(new TextEncoder().encode(onChain)).amountMinor).toBe('27500000')
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
test('only an approved invoice with a live balance is unpaid', () => {
	expect(isUnpaid({ Status: 'AUTHORISED', AmountDue: 275000 })).toBe(true)
	expect(isUnpaid({ Status: 'AUTHORISED', AmountDue: 0 })).toBe(false)
	expect(isUnpaid({ Status: 'DRAFT', AmountDue: 275000 })).toBe(false)
	expect(isUnpaid({ Status: 'AUTHORISED' })).toBe(false)
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
