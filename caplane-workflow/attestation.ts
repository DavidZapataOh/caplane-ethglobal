import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { type Hex, hashTypedData, hexToBytes, toHex } from 'viem'
import {
	CONFIRMATION_TYPES,
	type DebtorConfirmation,
	confirmationDomain,
} from '../claim/attestation'
import { claimIdOf } from '../claim/commit'
import { toComponents } from '../claim/index'
import { ClaimType } from './abi/frozen'
import type { Invoice, SubmittedClaim } from './ledger'

export const keccakOf = (value: string): Hex => toHex(keccak_256(new TextEncoder().encode(value)))

/**
 * Recovers who signed a confirmation. Three things about this library are measured, not assumed:
 *
 * `prehash` defaults to true, and with the default it hashes the digest a second time and recovers
 * a DIFFERENT, perfectly valid address without erroring. That is the failure that would let every
 * signature pass for the wrong signer with nothing red anywhere.
 *
 * The recovery byte goes FIRST — `[recovery, r, s]` — while wallets emit `[r, s, v]`. Getting that
 * order wrong throws rather than lying, which is the better of the two.
 *
 * `% 27` covers both conventions: wallets emit 27 and 28, some emit 0 and 1, and the modulo maps
 * all four onto 0 and 1. Subtracting 27 outright turns a 0 into 229 and the library refuses it.
 *
 * Returns undefined rather than throwing. A malformed signature has to be a refusal: an uncaught
 * throw aborts the whole execution and emits no report, so the submission is lost instead of
 * rejected, and nothing on chain records that it was ever seen.
 */
export const recoverConfirmer = (
	confirmation: DebtorConfirmation,
	signature: Hex,
	registry: Hex,
): Hex | undefined => {
	try {
		const digest = hexToBytes(
			hashTypedData({
				domain: confirmationDomain(registry),
				types: CONFIRMATION_TYPES,
				primaryType: 'DebtorConfirmation',
				message: confirmation,
			}),
		)
		const raw = hexToBytes(signature)
		if (raw.length !== 65) return undefined
		const reordered = Uint8Array.from([raw[64] % 27, ...raw.slice(0, 64)])
		const point = secp256k1.recoverPublicKey(reordered, digest, { prehash: false })
		// Recovery yields the compressed point; the address is the last twenty bytes of the hash
		// of the uncompressed key with its leading tag removed.
		const uncompressed = secp256k1.Point.fromBytes(point).toBytes(false)
		return toHex(keccak_256(uncompressed.slice(1)).slice(-20))
	} catch {
		return undefined
	}
}

/**
 * The trigger carries `values.v1.BigInt` — absolute bytes plus a sign — not a number, and the
 * field is optional. Compared raw it coerces to NaN, which is false against everything: every
 * confirmation would be refused while a test written with a `bigint` stayed green.
 */
export const blockNumberOf = (log: {
	blockNumber?: { absVal: Uint8Array; sign: bigint }
}): bigint | undefined =>
	log.blockNumber === undefined
		? undefined
		: log.blockNumber.absVal.reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n)

/**
 * The debtor names who they owe; the chain names who submitted. A copyist relaying someone else's
 * ciphertext is stopped here, holding a signature that is valid and names somebody else.
 *
 * The four invoice fields are compared exactly rather than through `claimId`, which buckets the
 * amount by powers of two: a confirmation signed over 27,500,000 would otherwise cover anything up
 * to 33,554,431. The contact comes from the invoice the enclave fetched, never from the claim, so
 * the submitter cannot nominate a confederate as the debtor of record.
 *
 * Every address comparison normalises. The recovered one is lowercase and the event's is EIP-55
 * checksummed, so a strict comparison is true for any pair of them — present and dead.
 *
 * What this cannot establish is that the recovered key belongs to that contact. Nothing in the
 * ledger carries a chain address, and the connection is read-only over contacts, so there is no
 * anchor to read. That link is made outside, by the channel that delivers the request.
 */
export const confirmationBinds = (
	confirmation: DebtorConfirmation,
	recovered: Hex | undefined,
	claim: SubmittedClaim,
	invoice: Invoice,
	submitter: Hex,
	blockNumber: bigint | undefined,
): boolean => {
	if (recovered === undefined || blockNumber === undefined) return false
	const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
	return (
		same(confirmation.creditor, submitter) &&
		same(confirmation.debtor, recovered) &&
		!same(confirmation.debtor, submitter) &&
		confirmation.claimId === claimIdOf(ClaimType.Invoice, toComponents(claim)) &&
		confirmation.debtorRef === keccakOf(invoice.Contact?.ContactID ?? '') &&
		confirmation.invoiceNumber === claim.invoiceNumber &&
		confirmation.currency === claim.currency &&
		confirmation.dueDate === claim.dueDate &&
		confirmation.amountMinor.toString() === claim.amountMinor &&
		confirmation.expiresAtBlock >= blockNumber
	)
}
