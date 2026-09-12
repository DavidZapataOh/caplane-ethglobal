import { readFileSync } from 'node:fs'
import { expect, test } from 'bun:test'
import type { Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CONFIRMATION_TYPES, type DebtorConfirmation, confirmationDomain } from '../claim/attestation'
import { lienIdOf } from '../claim/commit'
import { toComponents } from '../claim/index'
import { ClaimType } from './abi/frozen'
import { blockNumberOf, confirmationBinds, keccakOf, recoverConfirmer } from './attestation'

const DEBTOR = privateKeyToAccount(`0x${'03'.repeat(32)}`)
const SUBMITTER = privateKeyToAccount(`0x${'04'.repeat(32)}`)
// The deployed registry, read rather than retyped: it is the domain separator's
// `verifyingContract`, so a stale copy here would test a domain nothing signs against.
const REGISTRY = (await Bun.file('../contracts/abi/deployments.arc-testnet.json').json())
	.registry as Hex
const OTHER_REGISTRY = '0x000000000000000000000000000000000000dEaD' as const
const BLOCK = 61_626_829n

const CLAIM = {
	// The fixture carries it explicitly. decodeClaim defaults it for envelopes sealed before the
	// field existed, but a claim assembled in a test bypasses that and must say which instrument it
	// is — an absent type is a refusal, not an invoice.
	claimType: ClaimType.Invoice,
	debtorTaxId: 'Bayside Club',
	invoiceNumber: 'ORC1043',
	amountMinor: '27500000',
	currency: 'AUD',
	dueDate: '2026-12-31',
	issuerTaxId: 'e1218a28',
	country: 'AU',
}
const INVOICE = {
	Contact: { ContactID: '3e776c4b-ea9e-4bb1-96be-6b0c7a71a37f', Name: 'Bayside Club' },
}

const confirmationFor = (creditor: Hex, debtor: Hex): DebtorConfirmation => ({
	creditor,
	debtor,
	claimId: lienIdOf(ClaimType.Invoice, toComponents(ClaimType.Invoice, CLAIM)),
	invoiceNumber: 'ORC1043',
	currency: 'AUD',
	amountMinor: 27_500_000n,
	dueDate: '2026-12-31',
	debtorRef: keccakOf(INVOICE.Contact.ContactID),
	expiresAtBlock: BLOCK + 1_000n,
})

const sign = (
	account: typeof DEBTOR,
	confirmation: DebtorConfirmation,
	registry: Hex = REGISTRY,
): Promise<Hex> =>
	account.signTypedData({
		domain: confirmationDomain(registry),
		types: CONFIRMATION_TYPES,
		primaryType: 'DebtorConfirmation',
		message: confirmation,
	})

// The library defaults to hashing the digest again, and with that default it recovers a DIFFERENT,
// perfectly valid address without erroring. Measured. This is the one that would let every
// signature pass for the wrong signer, silently.
test('a wallet signature recovers the address that produced it', async () => {
	const c = confirmationFor(SUBMITTER.address, DEBTOR.address)
	expect(recoverConfirmer(c, await sign(DEBTOR, c), REGISTRY)?.toLowerCase()).toBe(
		DEBTOR.address.toLowerCase(),
	)
})

// This is the whole plan. The debtor signs honestly, about a real invoice they really owe, and
// names a creditor who is not the one submitting. A valid signature must still be refused.
test('an honest confirmation naming the wrong creditor is refused', async () => {
	const c = confirmationFor(OTHER_REGISTRY, DEBTOR.address)
	const recovered = recoverConfirmer(c, await sign(DEBTOR, c), REGISTRY)
	expect(confirmationBinds(c, recovered, CLAIM, INVOICE, SUBMITTER.address, BLOCK)).toBe(false)
})

test('a confirmation naming the submitter is accepted', async () => {
	const c = confirmationFor(SUBMITTER.address, DEBTOR.address)
	const recovered = recoverConfirmer(c, await sign(DEBTOR, c), REGISTRY)
	expect(confirmationBinds(c, recovered, CLAIM, INVOICE, SUBMITTER.address, BLOCK)).toBe(true)
})

// The claim id buckets the amount by powers of two, so binding only to it would let a confirmation
// signed for 27,500,000 cover anything up to 33,554,431 — nearly double the debt the debtor agreed
// to. The four fields the wallet displays are enforced exactly.
test('a confirmation for a different amount is refused', async () => {
	const c = { ...confirmationFor(SUBMITTER.address, DEBTOR.address), amountMinor: 30_000_000n }
	const recovered = recoverConfirmer(c, await sign(DEBTOR, c), REGISTRY)
	expect(confirmationBinds(c, recovered, CLAIM, INVOICE, SUBMITTER.address, BLOCK)).toBe(false)
})

// The signer declares who they are; the recovered key must agree. Without this a signature from
// any key passes as long as the struct names someone plausible.
test('a confirmation whose signer is not its declared debtor is refused', async () => {
	const c = confirmationFor(SUBMITTER.address, DEBTOR.address)
	const recovered = recoverConfirmer(c, await sign(SUBMITTER, c), REGISTRY)
	expect(confirmationBinds(c, recovered, CLAIM, INVOICE, SUBMITTER.address, BLOCK)).toBe(false)
})

// The contact is the ledger's, not the claim's: it comes from the invoice the enclave fetched, so
// the submitter cannot nominate a confederate as the debtor of record.
test('a confirmation pointing at another contact is refused', async () => {
	const c = { ...confirmationFor(SUBMITTER.address, DEBTOR.address), debtorRef: keccakOf('other') }
	const recovered = recoverConfirmer(c, await sign(DEBTOR, c), REGISTRY)
	expect(confirmationBinds(c, recovered, CLAIM, INVOICE, SUBMITTER.address, BLOCK)).toBe(false)
})

// The enclave has no clock. The trigger's own block height is the only time it can trust.
test('a confirmation past its block is refused', async () => {
	const c = confirmationFor(SUBMITTER.address, DEBTOR.address)
	const recovered = recoverConfirmer(c, await sign(DEBTOR, c), REGISTRY)
	expect(
		confirmationBinds(c, recovered, CLAIM, INVOICE, SUBMITTER.address, c.expiresAtBlock + 1n),
	).toBe(false)
})

// The domain pins the chain and the deployment: without it a staging confirmation replays against
// production, which is one signature meaning two different things.
test('a confirmation signed for another registry does not recover to its signer', async () => {
	const c = confirmationFor(SUBMITTER.address, DEBTOR.address)
	expect(
		recoverConfirmer(c, await sign(DEBTOR, c, OTHER_REGISTRY), REGISTRY)?.toLowerCase(),
	).not.toBe(DEBTOR.address.toLowerCase())
})

// A malformed signature throws out of the curve library. Uncaught, it aborts the execution and
// emits no report at all — the submission is lost rather than refused.
test('a malformed signature is a refusal, not a lost submission', () => {
	const c = confirmationFor(SUBMITTER.address, DEBTOR.address)
	expect(recoverConfirmer(c, '0xdead', REGISTRY)).toBeUndefined()
	expect(confirmationBinds(c, undefined, CLAIM, INVOICE, SUBMITTER.address, BLOCK)).toBe(false)
})

// Some wallets emit v as 0 and 1 rather than 27 and 28. Subtracting 27 turns a 0 into 229 and the
// library throws `invalid recovery id` — measured over all four values.
test('both recovery byte conventions recover the same address', async () => {
	const c = confirmationFor(SUBMITTER.address, DEBTOR.address)
	const signature = await sign(DEBTOR, c)
	const legacy = signature.slice(0, -2) as Hex
	const v = Number.parseInt(signature.slice(-2), 16)
	const modern = `${legacy}${(v - 27).toString(16).padStart(2, '0')}` as Hex
	expect(recoverConfirmer(c, modern, REGISTRY)).toBe(recoverConfirmer(c, signature, REGISTRY))
})

// The block height arrives as a protobuf message, not a number. Compared raw it coerces to NaN,
// which is always false — every confirmation refused, with the suite still green.
test('the block height is decoded from its protobuf shape', () => {
	expect(
		blockNumberOf({ blockNumber: { absVal: new Uint8Array([0x03, 0xac, 0x59, 0xcd]), sign: 1n } }),
	).toBe(61_626_829n)
	expect(blockNumberOf({})).toBeUndefined()
})

// viem's verify/recover helpers are async and trap in the enclave without a build flag we do not
// control. This keeps someone from reaching for the obvious one.
test('the enclave never reaches for an async verifier', () => {
	const source = readFileSync('./attestation.ts', 'utf8')
	for (const asyncHelper of [
		'verifyMessage',
		'recoverMessageAddress',
		'recoverAddress',
		'verifyTypedData',
	]) {
		expect(source).not.toContain(asyncHelper)
	}
})
