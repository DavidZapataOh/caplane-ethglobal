import { type TeeRuntime, cre, json, ok } from '@chainlink/cre-sdk'
import { ClaimType } from './abi/frozen'
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
import { decodeVin, matchesVehicle, openRecalls, vinQuery } from './vehicle'

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
/**
 * Three calls, whichever instrument arrives.
 *
 * The count is fixed on purpose and it is not bookkeeping: the instrument type travels inside the
 * sealed plaintext, so if an invoice spent four calls and a vehicle three, counting the outbound
 * requests would tell a node operator which instrument was submitted. What the type chooses is each
 * call's URL, headers and decoder — never how many there are.
 *
 *   role       invoice                          vehicle
 *   attest     a bearer token for the ledger    the public vehicle register decodes the number
 *   record     the invoice itself               open safety campaigns for that vehicle
 *   screen     the debtor the ledger names      the manufacturer the register names
 *
 * The screened name always comes from the external source and never from the claim. For an invoice
 * that is the debtor, which is the party that matters. For a vehicle the register knows vehicles and
 * not who owes money on them, so what can be screened is the manufacturer — a real concern for an
 * asset held as collateral, and a declared limitation rather than a hidden one: the obligor of a
 * vehicle claim is submitter-supplied and nothing external attests it.
 */
export const verifyExternally = (
	runtime: TeeRuntime<Config>,
	secrets: Record<string, { value: string }>,
	claim: SubmittedClaim,
): Verification => {
	const { config } = runtime
	const vehicle = claim.claimType === ClaimType.Equipment

	// First call. For an invoice a token; for a vehicle the decode, which needs no credential —
	// which is why this instrument fits inside a secret ring that has no room for a sixth entry.
	const attestResponse = http
		.sendRequest(runtime, {
			url: vehicle ? `${config.vinApiBase}/decodevinvalues/${vinQuery(claim.invoiceNumber)}?format=json` : config.ledgerTokenUrl,
			method: vehicle ? 'GET' : 'POST',
			// Bytes on the wire, base64 in the JSON form of the request. A raw string here is
			// reinterpreted as base64: it throws only if some character falls outside the
			// alphabet, and otherwise sends silent garbage.
			...(vehicle ? {} : { body: Buffer.from(TOKEN_FORM).toString('base64') }),
			multiHeaders: vehicle
				? { Accept: { values: ['application/json'] } }
				: {
						Authorization: {
							values: [basicAuth(secrets.LEDGER_APP_ID.value, secrets.LEDGER_APP_PASSPHRASE.value)],
						},
						'Content-Type': { values: ['application/x-www-form-urlencoded'] },
					},
			// A bearer token, cached, is a live credential sitting in a host-side store; and a
			// cached decode is a persisted record of which vehicle was asked about.
			cacheSettings: { store: false },
		})
		.result()
	if (!ok(attestResponse)) throw new Error(`attest ${attestResponse.statusCode}`)
	const decoded = vehicle ? decodeVin(json(attestResponse) as never) : undefined
	const token = vehicle ? '' : (json(attestResponse) as { access_token: string }).access_token

	// Second call. The collection form for an invoice, not the path form: a number the ledger does
	// not hold answers 200 with an empty array, where the path form answers 404 in plain text and
	// `json()` would throw on it. For a vehicle, the campaigns open against what the register just
	// said this vehicle is.
	const recordResponse = http
		.sendRequest(runtime, {
			url: vehicle
				? `${config.recallsApiBase}?make=${encodeURIComponent(decoded?.make ?? '')}&model=${encodeURIComponent(decoded?.model ?? '')}&modelYear=${encodeURIComponent(decoded?.modelYear ?? '')}`
				: `${config.ledgerApiBase}/Invoices?where=${encodeURIComponent(invoiceQuery(claim.invoiceNumber))}`,
			method: 'GET',
			multiHeaders: vehicle
				? { Accept: { values: ['application/json'] } }
				: {
						Authorization: { values: [`Bearer ${token}`] },
						'Xero-tenant-id': { values: [config.ledgerTenantId] },
						Accept: { values: ['application/json'] },
					},
			// The URL carries the instrument's identifier and the body carries the confidential
			// payload, persisted for ten minutes by default.
			cacheSettings: { store: false },
		})
		.result()
	if (!ok(recordResponse)) throw new Error(`record ${recordResponse.statusCode}`)
	const invoice = vehicle ? undefined : invoiceOf(json(recordResponse) as { Invoices?: Invoice[] })
	const recalls = vehicle ? openRecalls(json(recordResponse) as { Count?: number }) : undefined

	// Third call. The name is the external source's own spelling, never the claim's — the claim's
	// identity field is canonical text, and measured against the live service every multi-word
	// sanctioned entity screens clean once canonicalised.
	const screenedName = vehicle ? (decoded?.manufacturer ?? '') : (invoice?.Contact?.Name ?? '')
	// Made even when the record is absent, with an empty name. Branching here would make the number
	// of outbound calls depend on the content of a confidential response, and that count is
	// observable from outside. An empty name answers `total: 0` in 54 bytes, measured.
	const screenResponse = http
		.sendRequest(runtime, {
			url: `${config.watchlistUrl}?name=${encodeURIComponent(screenedName)}&size=${SCREENING_PAGE}`,
			method: 'GET',
			multiHeaders: { 'subscription-key': { values: [secrets.WATCHLIST_SUBSCRIPTION.value] } },
			// The URL carries the screened name.
			cacheSettings: { store: false },
		})
		.result()
	if (!ok(screenResponse)) throw new Error(`screen ${screenResponse.statusCode}`)

	return {
		exists: vehicle ? decoded?.exists === true : invoice !== undefined,
		// For an invoice, still owed. For a vehicle, no open safety campaign — and an unanswerable
		// count is not a clean one, which is why undefined fails here rather than passing as zero.
		unpaid: vehicle ? recalls === 0 : invoice !== undefined && isUnpaid(invoice),
		matches: vehicle
			? decoded !== undefined && matchesVehicle(decoded, claim)
			: invoice !== undefined && matchesClaim(invoice, claim),
		// An unanswerable screen is not a clean screen.
		screened: hasSanctionsHit(json(screenResponse) as ScreeningResponse) === false,
		invoice,
	}
}
