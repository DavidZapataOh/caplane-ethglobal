import { readFileSync, readdirSync } from 'node:fs'
import { expect, test } from 'bun:test'
import { type Hex, hexToBytes } from 'viem'
import { RejectReason } from './abi/frozen'
import { configSchema } from './config'
import { CLAIM_SUBMITTED_TOPIC, SECRET_IDS, decodeClaimSubmitted } from './workflow'

const ID = '0x5ab0000000000000000000000000000000000000000000000000000000000001'
const SUBMITTER = '0x86Ec9f04485Db066CF155353f15eef356Ae90253'
// Read, never retyped. A hardcoded copy goes stale the first time a contract is redeployed, and
// it goes stale silently on the one value the trigger filter is built from.
const INBOX = (await Bun.file('../contracts/abi/deployments.arc-testnet.json').json()).inbox

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
		'advanceRateBps',
		'escrowAddress',
		'feeRateBps',
		'graceSeconds',
		'inboxAddress',
		'ledgerApiBase',
		'ledgerCountry',
		'ledgerTenantId',
		'ledgerTokenUrl',
		'registryAddress',
		'rpcUrl',
		'settlementBaseUsdc6',
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
	// Three: two identifiers already public in the log, and the decision the report carries.
	// It carried ten. The extra seven were the individual verdicts — whether the debtor was
	// sanctioned, whether the receivable was already pledged, whether the signature bound — which
	// the on-chain reason code deliberately collapses. Publishing them here defeated that.
	expect(returned.match(/\$\{/g) ?? []).toHaveLength(3)
	expect(returned).toContain('decision.kind')
	for (const withheld of ['verified.', 'collision.', 'confirmed', 'signature', 'commitments', 'lienId']) {
		expect(returned).not.toContain(withheld)
	}
})

// The number and timing of outbound calls are observable from outside the enclave. Branching the
// registry read on a confidential result leaks by metadata what the encryption protects.
test('the registry is asked whenever the envelope opened', () => {
	const source = readFileSync('./workflow.ts', 'utf8')
	expect(source).not.toMatch(/verified\.\w+\s*(\?|&&)[^\n]*readRegistry/)
	expect(source).toMatch(/readRegistry\(runtime, secrets, submitted, blockNumber\)/)
})

const enclaveSources = () =>
	readdirSync('.')
		.filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
		.map((f) => readFileSync(f, 'utf8'))
		.join('\n')

// Anything logged leaves the enclave by Chainlink's own definition, and the ledger response is the
// single most sensitive object the handler ever holds. Swept rather than listed: the hand-written
// list named two files and three enclave modules have appeared since, the newest of them being
// exactly where someone would put a trace to see what is being signed.
test('the enclave never logs', () => {
	expect(enclaveSources()).not.toMatch(/runtime\.log\(|console\./)
})

// The door is not a filter: what crosses is exactly what the payload carries. One crossing, one
// report, both pinned across the whole package — a second one anywhere is how confidentiality ends
// with nothing failing. Two handlers now share it: two inline crossings would also satisfy a count
// of two callers, which is why the crossing itself stays at one.
test('both handlers report through the same crossing', () => {
	const sources = enclaveSources()
	expect(sources.match(/usingTheDons\(\)/g) ?? []).toHaveLength(1)
	expect(sources.match(/\.report\(/g) ?? []).toHaveLength(1)
	// The definition reads `submitReport = (`, so it does not match. These are the two call sites.
	expect(sources.match(/submitReport\(/g) ?? []).toHaveLength(2)
})

// Routing is by array position, and the settlement handler is index 1 — the index `simulate` is
// pointed at with `--trigger-index 1`. The comparison is inside the registration array: comparing
// raw file offsets would compare an import against a definition.
test('the workflow registers two handlers, settlement second', () => {
	const source = readFileSync('./workflow.ts', 'utf8')
	const registrations = /return \[([\s\S]*?)\n\t\]/.exec(source)?.[1] ?? ''
	expect(registrations.match(/handlerInTee\(/g) ?? []).toHaveLength(2)
	expect(registrations.indexOf('onClaimSubmitted')).toBeGreaterThanOrEqual(0)
	expect(registrations.indexOf('onClaimSubmitted')).toBeLessThan(
		registrations.indexOf('onAdvanceSettled'),
	)
})

// The borrower is the address the chain says submitted, never one the plaintext asserts. This is
// the guard that stops a copyist's relay from landing a lien on the victim's receivable.
test('a record never names a borrower the event did not', () => {
	expect(readFileSync('./workflow.ts', 'utf8')).toMatch(/borrower:\s*claim\.submitter/)
})

// Four calls cost the ledger a token exchange and two queries, plus one to the registry. A claim
// whose sealer did not authorise its submitter is refused either way, so spending the quota buys
// a verdict that cannot change. Both outbound paths hang off the same gate, and that gate is the
// envelope — never anything a third party answered.
test('an unauthorized submission reaches no external service', () => {
	const source = readFileSync('./workflow.ts', 'utf8')
	// Both outbound paths sit inside one guard whose only gate is `authorized` — a fact about the
	// envelope, never anything a third party answered. Branching either on a verification result
	// would make the call count depend on confidential content, which is observable from outside.
	expect(source).toMatch(/if \(authorized\) \{/)
	expect(source).not.toMatch(/verified\.\w+\s*(\?|&&)[^\n]*(verifyExternally|readRegistry)\(/)
})

// The underwriting policy is configuration, not a secret. The ring sits exactly at the documented
// ceiling of five and a published policy buys no confidentiality — the same call the collision
// threshold makes, where publishing it is what makes the measured rate checkable.
test('the policy is readable and numeric', () => {
	for (const key of ['advanceRateBps', 'feeRateBps', 'settlementBaseUsdc6', 'graceSeconds']) {
		expect(STAGING[key]).toMatch(/^[0-9]+$/)
	}
	expect(Number(STAGING.advanceRateBps)).toBeLessThanOrEqual(10_000)
	expect(Number(STAGING.feeRateBps)).toBeLessThanOrEqual(10_000)
})

// The pool holds sixteen USDC. An advance it cannot fund reverts inside SafeERC20 with no named
// error, so base times rate has to stay under what is actually there.
test('the configured advance fits what the pool holds', () => {
	const advance =
		(BigInt(STAGING.settlementBaseUsdc6) * BigInt(STAGING.advanceRateBps)) / 10_000n
	expect(advance).toBeLessThanOrEqual(16_000_000n)
})

// --- the values that cannot be corrected after deployment ------------------------

// The production workflow name is the one irreversible string in the project: the registry has it
// as an immutable, checks every report against it, and has no setter. A name differing by one
// character is not an error — the DON signs, the forwarder transmits, and `onReport` rejects for
// ever. Nothing guarded it until this test.
test('the production workflow name derives to what the registry has frozen', async () => {
	const yaml = readFileSync('./workflow.yaml', 'utf8')
	const production = yaml.slice(yaml.indexOf('production-settings:'))
	const name = /workflow-name:\s*"([^"]+)"/.exec(production)?.[1]
	expect(name).toBe('caplane-registry')

	const deployments = await Bun.file('../contracts/abi/deployments.arc-testnet.json').json()
	// bytes10 of the first ten hex characters of the digest, taken as ASCII — which is what the
	// forwarder packs and what the contract compares.
	const digest = new Bun.CryptoHasher('sha256').update(name as string).digest('hex')
	const derived = `0x${Buffer.from(digest.slice(0, 10), 'ascii').toString('hex')}`
	expect(derived).toBe(deployments.workflowName)
})

// Staging must NOT derive to the production identity, or a staging deploy writes to the real
// registry. This is the only thing separating the two environments.
test('the staging workflow name cannot write to the production registry', async () => {
	const yaml = readFileSync('./workflow.yaml', 'utf8')
	const staging = yaml.slice(yaml.indexOf('staging-settings:'), yaml.indexOf('production-settings:'))
	const name = /workflow-name:\s*"([^"]+)"/.exec(staging)?.[1]
	const deployments = await Bun.file('../contracts/abi/deployments.arc-testnet.json').json()
	const digest = new Bun.CryptoHasher('sha256').update(name as string).digest('hex')
	const derived = `0x${Buffer.from(digest.slice(0, 10), 'ascii').toString('hex')}`
	expect(derived).not.toBe(deployments.workflowName)
})

// The addresses were compared between the two config files and never against the deployment
// record, so two identical wrong files passed.
test('every configured address is the deployed one', async () => {
	const deployments = await Bun.file('../contracts/abi/deployments.arc-testnet.json').json()
	for (const config of [STAGING, await Bun.file('./config.production.json').json()]) {
		expect(config.inboxAddress.toLowerCase()).toBe(deployments.inbox.toLowerCase())
		expect(config.registryAddress.toLowerCase()).toBe(deployments.registry.toLowerCase())
		expect(config.escrowAddress.toLowerCase()).toBe(deployments.escrow.toLowerCase())
	}
})

// viem's hexToBytes puts the WHOLE input string into its error message, and that message leaves
// the enclave as the execution failure reason. Two call sites hand it raw vault content: the
// X25519 private key and the pepper. A secret uploaded as text rather than hex would print the
// key node operators are not supposed to have — and neither secret can be rotated.
test('a secret is checked before it is decoded, and never echoed', () => {
	const sources = enclaveSources()
	expect(sources).not.toMatch(/hexToBytes\(\s*secrets\./)
	expect(sources).toMatch(/secretBytes\(/)
})

// A reject carries no lien id. The registry's reject branch never reads it, and it is an
// offline-derivable fingerprint of the claim — published next to the reason it was refused.
test('a rejected claim publishes no lien id', () => {
	const source = readFileSync('./workflow.ts', 'utf8')
	expect(source).toMatch(/lienId:[\s\S]{0,120}decision\.kind === ReportKind\.Record/)
	expect(source).toContain('zeroHash')
})

// Every submitter-controlled parse and canonicalisation used to throw straight out of the handler.
// An uncaught throw emits no report at all: the submitter paid gas, the inbox permanently consumed
// their submission id, and nothing on chain recorded the claim was ever seen. The codebase already
// stated the rule — `recoverConfirmer` returns undefined rather than throwing, for exactly this
// reason — and honoured it in one place out of eight.
test('no submitter input can abort the handler without a report', () => {
	const source = readFileSync('./workflow.ts', 'utf8')
	// The whole decision region is guarded, and the guard produces a decision rather than rethrowing.
	expect(source).toMatch(/try \{/)
	expect(source).toMatch(/catch[\s\S]{0,200}MalformedClaim|catch[\s\S]{0,200}VerificationUnavailable/)
	// And the crossing is outside the guard, so a report is emitted on every path.
	const afterCatch = source.slice(source.lastIndexOf('}'))
	expect(source.indexOf('submitReport(')).toBeGreaterThan(source.indexOf('catch'))
})

// The reasons must be distinguishable on chain. A malformed claim and an unreachable ledger are
// different remediations, and neither is "your receivable is already pledged".
test('every reject reason fits the uint8 that carries it', () => {
	const values = Object.values(RejectReason)
	expect(Math.max(...values)).toBeLessThanOrEqual(255)
	expect(new Set(values).size).toBe(values.length)
})

// `open()` sits before the decision guard, so an envelope that cannot be opened used to abort the
// handler with no report — the same disappearance the guard exists to remove, on the one input
// nobody controls: the inbox is permissionless, so anyone can submit arbitrary bytes for the price
// of gas, and a sealer using a stale enclave key produces the same outcome by accident.
test('an envelope that does not open is refused, not dropped', () => {
	const source = readFileSync('./workflow.ts', 'utf8')
	const opened = source.indexOf('open(')
	const firstTry = source.indexOf('try {')
	expect(firstTry).toBeLessThan(opened)
	expect(source).toContain('MalformedEnvelope')
})
