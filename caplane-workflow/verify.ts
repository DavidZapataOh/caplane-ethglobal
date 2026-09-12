import { type TeeRuntime, cre, json, ok } from '@chainlink/cre-sdk'
import type { Config } from './config'
import {
	type Invoice,
	type ScreeningResponse,
	type SubmittedClaim,
	basicAuth,
	hasSanctionsHit,
	invoiceOf,
	invoiceQuery,
	isUnpaid,
	matchesClaim,
} from './ledger'

const http = new cre.capabilities.HTTPClient()

const TOKEN_FORM = 'grant_type=client_credentials&scope=accounting.invoices.read'

/** How many records the watchlist returns, not how many it found. The count is read, not the page. */
const SCREENING_PAGE = 3

export type Verification = {
	exists: boolean
	unpaid: boolean
	matches: boolean
	screened: boolean
	/**
	 * The invoice the ledger returned, carried out with the verdicts because the debtor's
	 * confirmation points at the ledger's own contact id. Re-fetching it downstream would cost a
	 * second call against a quota with one left.
	 */
	invoice?: Invoice
}

export const UNVERIFIED: Verification = {
	exists: false,
	unpaid: false,
	matches: false,
	screened: false,
}

/**
 * Three outbound calls from inside the enclave: exchange the application credentials for a token,
 * read the claimed invoice out of the ledger, and screen the name the ledger holds for the debtor.
 * What comes back is four booleans; none of the 1.5 KB that carried them goes anywhere else.
 *
 * The secrets arrive already fetched — the ring is read once, at the top of the handler — and the
 * runtime is the TEE one, which is the only overload of `sendRequest` that accepts it. The other
 * overload aggregates by consensus and demands the ordinary runtime, which a TEE handler never
 * holds; obtaining one would mean routing the request back out.
 */
export const verifyExternally = (
	runtime: TeeRuntime<Config>,
	secrets: Record<string, { value: string }>,
	claim: SubmittedClaim,
): Verification => {
	const { config } = runtime

	const tokenResponse = http
		.sendRequest(runtime, {
			url: config.ledgerTokenUrl,
			method: 'POST',
			// Bytes on the wire, base64 in the JSON form of the request. A raw string here is
			// reinterpreted as base64: it throws only if some character falls outside the
			// alphabet, and otherwise sends silent garbage.
			body: Buffer.from(TOKEN_FORM).toString('base64'),
			multiHeaders: {
				Authorization: {
					values: [basicAuth(secrets.LEDGER_APP_ID.value, secrets.LEDGER_APP_PASSPHRASE.value)],
				},
				'Content-Type': { values: ['application/x-www-form-urlencoded'] },
			},
			// The bearer token, cached, is a live credential sitting in a host-side store.
			cacheSettings: { store: false },
		})
		.result()
	if (!ok(tokenResponse)) throw new Error(`token ${tokenResponse.statusCode}`)
	const token = (json(tokenResponse) as { access_token: string }).access_token

	// The collection form, not the path form: a number the ledger does not hold answers 200 with
	// an empty array, where the path form answers 404 in plain text and `json()` would throw on
	// it. It is also a third of the bytes.
	const invoiceResponse = http
		.sendRequest(runtime, {
			url: `${config.ledgerApiBase}/Invoices?where=${encodeURIComponent(invoiceQuery(claim.invoiceNumber))}`,
			method: 'GET',
			multiHeaders: {
				Authorization: { values: [`Bearer ${token}`] },
				'Xero-tenant-id': { values: [config.ledgerTenantId] },
				Accept: { values: ['application/json'] },
			},
			// The URL carries the invoice number and the body carries the debtor, the amount and
			// the due date — the confidential payload, persisted for ten minutes by default.
			cacheSettings: { store: false },
		})
		.result()
	if (!ok(invoiceResponse)) throw new Error(`ledger ${invoiceResponse.statusCode}`)
	const invoice = invoiceOf(json(invoiceResponse) as { Invoices?: Invoice[] })

	// The ledger's own name for the debtor, in the ledger's own spelling. The claim carries no
	// name, and its identity field is canonical text — measured against the live service, every
	// multi-word sanctioned entity screens clean once canonicalised.
	const debtorName = invoice?.Contact?.Name ?? ''
	// Made even when the invoice is absent, with an empty name. Branching here would make the
	// number of outbound calls depend on the content of a confidential response, and that count
	// is observable from outside. An empty name answers `total: 0` in 54 bytes, measured.
	const screeningResponse = http
		.sendRequest(runtime, {
			url: `${config.watchlistUrl}?name=${encodeURIComponent(debtorName)}&size=${SCREENING_PAGE}`,
			method: 'GET',
			multiHeaders: { 'subscription-key': { values: [secrets.WATCHLIST_SUBSCRIPTION.value] } },
			// The URL carries the debtor's name.
			cacheSettings: { store: false },
		})
		.result()
	if (!ok(screeningResponse)) throw new Error(`watchlist ${screeningResponse.statusCode}`)

	return {
		exists: invoice !== undefined,
		unpaid: invoice !== undefined && isUnpaid(invoice),
		matches: invoice !== undefined && matchesClaim(invoice, claim),
		// An unanswerable screen is not a clean screen.
		screened: hasSanctionsHit(json(screeningResponse) as ScreeningResponse) === false,
		invoice,
	}
}
