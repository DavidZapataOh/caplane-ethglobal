import { readFileSync, readdirSync } from 'node:fs'
import { expect, test } from 'bun:test'
import { type Hex, hexToBytes } from 'viem'
import { CLAIM_SUBMITTED_TOPIC, SECRET_IDS, configSchema, decodeClaimSubmitted } from './workflow'

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
// the likeliest way to register a subscription against nothing.
test('refuses an address that is not twenty bytes', () => {
	expect(() => configSchema.parse({ inboxAddress: '0x14f3bb' })).toThrow()
})

test('accepts the deployed inbox', () => {
	expect(configSchema.parse({ inboxAddress: INBOX }).inboxAddress).toBe(INBOX)
})

// The config files ship with the workflow and are read by the platform, not by the tests, so
// they are asserted here or they are asserted nowhere.
test('both config files carry the same shape and no dead keys', async () => {
	const staging = await Bun.file('./config.staging.json').json()
	const production = await Bun.file('./config.production.json').json()
	expect(Object.keys(staging).sort()).toEqual(['inboxAddress'])
	expect(Object.keys(production).sort()).toEqual(Object.keys(staging).sort())
	expect(() => configSchema.parse(staging)).not.toThrow()
	expect(() => configSchema.parse(production)).not.toThrow()
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
