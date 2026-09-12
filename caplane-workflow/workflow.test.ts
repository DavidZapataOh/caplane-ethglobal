import { readFileSync, readdirSync } from 'node:fs'
import { expect, test } from 'bun:test'
import { type Hex, hexToBytes } from 'viem'
import { configSchema } from './config'
import { CLAIM_SUBMITTED_TOPIC, SECRET_IDS, decodeClaimSubmitted } from './workflow'

const ID = '0x5ab0000000000000000000000000000000000000000000000000000000000001'
const SUBMITTER = '0x86Ec9f04485Db066CF155353f15eef356Ae90253'
const INBOX = '0x14f3bbf3b21b0411f798aa50edd05df06e72ae88'

// The event's two indexed fields arrive as raw 32-byte topics, and an address is
// left-padded. Reading topics[2] as-is yields a 32-byte string that is not an address.
const log = {
	topics: [
		hexToBytes(CLAIM_SUBMITTED_TOPIC),
		hexToBytes(ID),
		// `as Hex`: a template literal widens to `string`, and hexToBytes wants `0x${string}`.
		hexToBytes(`0x000000000000000000000000${SUBMITTER.slice(2).toLowerCase()}` as Hex),
	],
	data: hexToBytes(
		`0x${'00'.repeat(31)}20${'00'.repeat(31)}03abcdef${'00'.repeat(29)}` as Hex,
	),
}

test('takes the submission id and the submitter out of the topics', () => {
	const claim = decodeClaimSubmitted(log)
	expect(claim.submissionId).toBe(ID)
	expect(claim.submitter).toBe(SUBMITTER)
})

// The length is the only thing this plan reads out of the payload. Everything else about the
// envelope belongs to the plan that decrypts it.
test('reports the envelope length without reading the envelope', () => {
	expect(decodeClaimSubmitted(log).envelopeBytes).toBe(3)
})

// The topic is the whole registration filter. This pins the DERIVED value against the one
// measured off the deployed contract's verified ABI — two different paths to the same 32 bytes,
// so a change to either the signature or the derivation shows up here.
test('the derived topic matches the one the deployed contract emits', () => {
	expect(CLAIM_SUBMITTED_TOPIC).toBe(
		'0x8af2b32ba8e251a8a7c973226674ac1045c1be5b98c6717bd9c9f9ba8b6b801f',
	)
})

// A config is the only thing that varies between staging and production, so a malformed one is
// the likeliest way to register a subscription against nothing. Built from the shipped file
// rather than from a literal: a bare `{ inboxAddress }` now throws for the four missing keys,
// which would make this pass while proving nothing about the address.
const STAGING = await Bun.file('./config.staging.json').json()

test('refuses an address that is not twenty bytes', () => {
	expect(() => configSchema.parse({ ...STAGING, inboxAddress: '0x14f3bb' })).toThrow()
})

test('refuses an endpoint that is not https', () => {
	expect(() => configSchema.parse({ ...STAGING, watchlistUrl: 'http://data.trade.gov/x' })).toThrow()
})

test('accepts the deployed inbox', () => {
	expect(configSchema.parse(STAGING).inboxAddress).toBe(INBOX)
})

// The config files ship with the workflow and are read by the platform, not by the tests, so
// they are asserted here or they are asserted nowhere.
test('both config files carry the same shape and no dead keys', async () => {
	const production = await Bun.file('./config.production.json').json()
	expect(Object.keys(STAGING).sort()).toEqual([
		'inboxAddress',
		'ledgerApiBase',
		'ledgerTenantId',
		'ledgerTokenUrl',
		'registryAddress',
		'rpcUrl',
		'watchlistUrl',
	])
	expect(Object.keys(production).sort()).toEqual(Object.keys(STAGING).sort())
	expect(() => configSchema.parse(STAGING)).not.toThrow()
	expect(() => configSchema.parse(production)).not.toThrow()
})

// The tenant names the accounting organisation and authorises nothing on its own, which is why
// it may live in configuration while the application's credentials live in the vault. A wrong
// one is a 401 from a call that has already spent the token exchange.
test('the ledger tenant is a uuid, not a credential', () => {
	expect(STAGING.ledgerTenantId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

// `api.trade.gov` carries an expired TLS certificate and an enclave cannot accept a warning;
// the static list is 33,752,788 bytes against a 100 KB response cap. Neither is reachable, so
// the keyed endpoint on `data.trade.gov` is the only path, not a preference.
// Neither of the registry's two values is a secret and neither could be: the endpoint carries no
// credential, the address is public on chain, and the secret ring is already at the documented
// ceiling of five, so a sixth would not fit.
test('the registry endpoint carries no credential', () => {
	expect(STAGING.rpcUrl).toBe('https://rpc.testnet.arc.io')
	expect(STAGING.registryAddress).toMatch(/^0x[0-9a-f]{40}$/)
})

test('no endpoint the enclave cannot reach', () => {
	for (const url of [
		STAGING.ledgerTokenUrl,
		STAGING.ledgerApiBase,
		STAGING.watchlistUrl,
		STAGING.rpcUrl,
	]) {
		expect(url.startsWith('https://')).toBe(true)
		expect(url).not.toContain('api.trade.gov')
	}
})

// The quota is five calls per execution, and four later handlers will each want credentials.
// One call is the design; this is what keeps it one.
test('the workflow asks for its secrets exactly once', () => {
	const sources = readdirSync('.')
		.filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
		.map((f) => readFileSync(f, 'utf8'))
		.join('\n')
	expect(sources.match(/getSecrets?\(/g) ?? []).toHaveLength(1)
})

// A batch with a repeated id is rejected client-side before any host call, because the response
// is keyed by id — so a duplicate is a silent way to lose a secret.
test('no id is asked for twice', () => {
	expect(new Set(SECRET_IDS).size).toBe(SECRET_IDS.length)
})

// Every id must exist in secrets.yaml, or the handler aborts at `.result()` with nothing after
// it running. The failure is total and it happens in production, not here.
test('every id the handler asks for is declared in the vault file', () => {
	const declared = new Set(
		[...readFileSync('../secrets.yaml', 'utf8').matchAll(/^\s{2,}(\w+):$/gm)].map((m) => m[1]),
	)
	for (const id of SECRET_IDS) expect(declared).toContain(id)
})

// And the converse: an id declared and never asked for is a name to keep synchronised for
// nothing, and an env var every simulate in the repository will demand.
test('nothing is declared that the handler never asks for', () => {
	const declared = [...readFileSync('../secrets.yaml', 'utf8').matchAll(/^\s{2,}(\w+):$/gm)]
	expect(declared.map((m) => m[1]).sort()).toEqual([...SECRET_IDS].sort())
})

// The handler's return value is the widest channel that is not obviously one. Two identifiers
// that were already public in the log, plus five booleans. Nothing derived from a body — and
// that includes a length, which distinguishes one invoice from another.
test('the handler returns facts about the body, never the body', () => {
	const source = readFileSync('./workflow.ts', 'utf8')
	const returned = /return\s+`([^`]*)`/.exec(source)?.[1] ?? ''
	expect(returned).not.toBe('')
	expect(returned).not.toContain('json(')
	expect(returned).not.toContain('length')
	// Seven became eight when the collision verdict joined. Pinned, because the return value is
	// the widest channel out of the enclave that does not look like one.
	expect(returned.match(/\$\{/g) ?? []).toHaveLength(8)
	expect(returned).toContain('collision.status')
	// The commitments are the query itself; the lien id is registry state the enclave was told.
	// Neither is a fact about this claim that anyone outside is entitled to.
	expect(returned).not.toContain('commitments')
	expect(returned).not.toContain('lienId')
})

// The number and timing of outbound calls are observable from outside the enclave. Branching the
// registry read on a confidential result leaks by metadata what the encryption protects.
test('the registry is asked whenever the envelope opened', () => {
	const source = readFileSync('./workflow.ts', 'utf8')
	expect(source).not.toMatch(/verified\.\w+\s*(\?|&&)[^\n]*readRegistry/)
	expect(source).toMatch(/submitted\s*\n?\s*\?\s*readRegistry/)
})

// Anything logged leaves the enclave by Chainlink's own definition, and the ledger response is
// the single most sensitive object the handler ever holds.
test('the enclave never logs', () => {
	const source = readFileSync('./workflow.ts', 'utf8') + readFileSync('./verify.ts', 'utf8')
	expect(source).not.toMatch(/runtime\.log\(|console\./)
})

// Four calls cost the ledger a token exchange and two queries, plus one to the registry. A claim
// whose sealer did not authorise its submitter is refused either way, so spending the quota buys
// a verdict that cannot change. Both outbound paths hang off the same gate, and that gate is the
// envelope — never anything a third party answered.
test('an unauthorized submission reaches no external service', () => {
	const source = readFileSync('./workflow.ts', 'utf8')
	const guards = [...source.matchAll(/(\w+)\s*\n?\s*\?\s*(verifyExternally|readRegistry)\(/g)]
	expect(guards).toHaveLength(2)
	expect(new Set(guards.map((g) => g[1])).size).toBe(1)
	expect(source).toMatch(/const submitted = authorized \?/)
})
