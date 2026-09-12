import { CHAIN } from './abi/frozen'

/**
 * Written out rather than imported: this package has three dependencies, all of them pure hash
 * and curve code, and it compiles into the enclave binary. viem is not one of them and this type
 * is not a reason to make it one — `commit.ts` spells the same thing inline for the same reason.
 */
type Hex = `0x${string}`

/**
 * What a debtor signs to confirm a receivable, and what a wallet displays while they do.
 *
 * `debtor` is in the struct even though nothing can prove the signer is that party: the wallet
 * shows it, so whoever signs sees which identity they are asserting, and the enclave checks the
 * recovered key against it — which turns a signature made for one party and replayed by another
 * into a refusal rather than a lucky match.
 *
 * The four invoice fields are here because the enclave enforces them exactly. Binding only to
 * `claimId` would not: that identifier passes the amount through a power-of-two bucket, so a
 * confirmation signed over 27,500,000 would cover anything up to 33,554,431. Showing someone a
 * number the verifier does not enforce is the failure this signature format exists to prevent.
 */
export type DebtorConfirmation = {
	creditor: Hex
	debtor: Hex
	claimId: Hex
	invoiceNumber: string
	currency: string
	amountMinor: bigint
	dueDate: string
	debtorRef: Hex
	expiresAtBlock: bigint
}

export const CONFIRMATION_TYPES = {
	DebtorConfirmation: [
		{ name: 'creditor', type: 'address' },
		{ name: 'debtor', type: 'address' },
		{ name: 'claimId', type: 'bytes32' },
		{ name: 'invoiceNumber', type: 'string' },
		{ name: 'currency', type: 'string' },
		{ name: 'amountMinor', type: 'uint256' },
		{ name: 'dueDate', type: 'string' },
		{ name: 'debtorRef', type: 'bytes32' },
		{ name: 'expiresAtBlock', type: 'uint64' },
	],
} as const

/**
 * The verifying contract is the registry and nothing on chain checks this signature: the field is
 * domain separation, not a verifier. It stops a confirmation signed against one deployment from
 * meaning anything against another.
 */
export const confirmationDomain = (registry: Hex) =>
	({
		name: 'Caplane',
		version: '1',
		chainId: CHAIN.arcTestnet.chainId,
		verifyingContract: registry,
	}) as const

/** Expiry is a block height because the enclave has no clock: the trigger carries the height. */
export const CONFIRMATION_FIELDS = [
	'creditor',
	'debtor',
	'claimId',
	'invoiceNumber',
	'currency',
	'amountMinor',
	'dueDate',
	'debtorRef',
	'expiresAtBlock',
] as const
