#!/usr/bin/env bun
import { hasSanctionsHit, invoiceIdOf, isUnpaid } from './parse'

/**
 * Live check that the three external dependencies still answer with the record we expect.
 * A 200 is not the bar: an empty result set is also a 200. Every assertion below names a
 * concrete record, and nothing ever prints a credential — only names, lengths and sizes.
 */

const budgets = (await Bun.file(new URL('../../budgets.json', import.meta.url)).json()) as {
	cre: { httpResponseBytes: number }
	data: {
		accounting: { invoiceResponseBytes: number | null }
		screening: { responseBytesAtSizeThree: number | null }
	}
}

const corpusUrl = new URL('../../evidence/data/02-invoice-corpus.json', import.meta.url)

const required = (name: string): string => {
	const value = process.env[name]
	if (!value) throw new Error(`missing required environment variable: ${name}`)
	return value
}

const failures: string[] = []
const check = (label: string, passed: boolean, detail: string) => {
	console.log(`${passed ? 'ok  ' : 'FAIL'} ${label} — ${detail}`)
	if (!passed) failures.push(label)
}

/**
 * Until a response has been measured its budget is null, and the platform's own response cap
 * is the ceiling. Recording the measured value later tightens the check without touching this.
 */
const withinBudget = (label: string, bytes: number, budget: number | null) => {
	const ceiling = budget ?? budgets.cre.httpResponseBytes
	const basis = budget === null ? 'enclave cap, not yet measured' : 'recorded budget'
	check(label, bytes <= ceiling, `${bytes} of ${ceiling} bytes (${basis})`)
}

const ledgerId = required('LEDGER_APP_ID')
const ledgerPassphrase = required('LEDGER_APP_PASSPHRASE')
const watchlist = required('WATCHLIST_SUBSCRIPTION')

// --- accounting -------------------------------------------------------------------------

const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
	method: 'POST',
	headers: {
		Authorization: `Basic ${btoa(`${ledgerId}:${ledgerPassphrase}`)}`,
		'Content-Type': 'application/x-www-form-urlencoded',
	},
	// Read-only on purpose. The connection itself also holds the write scope, used once to seed
	// the corpus; the token this probe and the enclave hold cannot alter the ledger.
	body: 'grant_type=client_credentials&scope=accounting.invoices.read',
})
const token = (await tokenResponse.json()) as Record<string, unknown>

check('token issued', typeof token.access_token === 'string', `${tokenResponse.status}`)

// The whole architecture rests on this being absent: the enclave reads the vault and cannot
// write back, so a rotating refresh token would strand it after one execution.
check('credential is durable', !('refresh_token' in token), `refresh_token present: ${'refresh_token' in token}`)
console.log(`     access token lifetime: ${token.expires_in ?? 'not stated'} seconds`)

const accessToken = String(token.access_token)

const connections = (await (
	await fetch('https://api.xero.com/connections', {
		headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
	})
).json()) as Array<{ tenantId?: string }>
const tenant = connections[0]?.tenantId
check('tenant reachable', typeof tenant === 'string', `${connections.length} connection(s)`)

const corpus = (await Bun.file(corpusUrl).json()) as { canonical: { invoiceId: string } }
const invoiceResponse = await fetch(
	`https://api.xero.com/api.xro/2.0/Invoices/${corpus.canonical.invoiceId}`,
	{
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Xero-tenant-id': String(tenant),
			Accept: 'application/json',
		},
	},
)
const invoiceBody = await invoiceResponse.text()
const invoiceEnvelope = JSON.parse(invoiceBody) as { Invoices?: Array<Record<string, unknown>> }
const invoice = invoiceEnvelope.Invoices?.[0] ?? {}

check(
	'canonical invoice found',
	invoiceIdOf(invoiceEnvelope as never) === corpus.canonical.invoiceId,
	String(invoice.InvoiceNumber ?? 'not returned'),
)
check('canonical invoice is unpaid', isUnpaid(invoice as never), `${invoice.Status} due=${invoice.AmountDue}`)
withinBudget('invoice response fits', invoiceBody.length, budgets.data.accounting.invoiceResponseBytes)

// --- screening --------------------------------------------------------------------------

const screen = async (name: string) => {
	const response = await fetch(
		`https://data.trade.gov/consolidated_screening_list/v1/search?name=${encodeURIComponent(name)}&size=3`,
		{ headers: { 'subscription-key': watchlist } },
	)
	const body = await response.text()
	return {
		answered: response.ok,
		hit: hasSanctionsHit(JSON.parse(body)),
		bytes: body.length,
		status: response.status,
	}
}

const listed = await screen('kunlun')
const clean = await screen('zzqxwvunlikelyname')

// Both arms must assert the request was answered. Without it a rejected key reads as "no hit"
// and the clean-name arm passes for the wrong reason, which is the same trap as trusting a 200.
check('a listed name hits', listed.answered && listed.hit, `http ${listed.status}`)
check('a clean name does not hit', clean.answered && !clean.hit, `http ${clean.status}`)
check(
	'screening size is measurable',
	listed.answered,
	listed.answered ? `${listed.bytes} bytes` : 'not answered, size means nothing',
)
if (listed.answered) {
	withinBudget('screening response fits', listed.bytes, budgets.data.screening.responseBytesAtSizeThree)
}

if (failures.length > 0) {
	console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`)
	process.exit(1)
}
console.log('\nall data sources answered with the expected record')
