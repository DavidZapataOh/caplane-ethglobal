/**
 * Signs a debtor confirmation and writes it as JSON to stdout.
 *
 * Signing needs entropy and an event loop, neither of which the enclave has, so it happens out
 * here. The enclave only recovers. In production the request reaches the debtor through a
 * one-time link sent to the address the ledger holds, and that channel — not this tool and not
 * the enclave — is what ties the signing key to the debtor.
 *
 *   DEBTOR_KEY=0x… REGISTRY_ADDRESS=0x… \
 *     bun run tools/confirm-cli.ts <claim.json> <creditor> <contactId> <expiresAtBlock>
 */
import { keccak_256 } from '@noble/hashes/sha3.js'
import { type Hex, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CONFIRMATION_TYPES, confirmationDomain } from '../attestation'
import { lienIdOf } from '../commit'
// `ClaimType` is not on the barrel: it comes from the frozen copy the contracts emit.
import { ClaimType } from '../abi/frozen'
import { toComponents } from '../index'

const need = (name: string): string => {
	const value = process.env[name]
	if (value === undefined || value === '') throw new Error(`missing ${name}`)
	return value
}

const [claimPath, creditor, contactId, expiresAtBlock] = process.argv.slice(2)
if (
	claimPath === undefined ||
	creditor === undefined ||
	contactId === undefined ||
	expiresAtBlock === undefined
) {
	throw new Error('usage: confirm-cli <claim.json> <creditor> <contactId> <expiresAtBlock>')
}

const claim = JSON.parse(await Bun.file(claimPath).text())
const account = privateKeyToAccount(need('DEBTOR_KEY') as Hex)

const confirmation = {
	creditor: creditor as Hex,
	debtor: account.address,
	claimId: lienIdOf(ClaimType.Invoice, toComponents(claim)),
	invoiceNumber: claim.invoiceNumber,
	currency: claim.currency,
	amountMinor: BigInt(claim.amountMinor),
	dueDate: claim.dueDate,
	debtorRef: toHex(keccak_256(new TextEncoder().encode(contactId))),
	expiresAtBlock: BigInt(expiresAtBlock),
}

const signature = await account.signTypedData({
	domain: confirmationDomain(need('REGISTRY_ADDRESS') as Hex),
	types: CONFIRMATION_TYPES,
	primaryType: 'DebtorConfirmation',
	message: confirmation,
})

// Numbers leave as strings: JSON has no bigint, and the sealed plaintext carries them as text.
console.log(
	JSON.stringify({
		confirmation: {
			...confirmation,
			amountMinor: confirmation.amountMinor.toString(),
			expiresAtBlock: confirmation.expiresAtBlock.toString(),
		},
		signature,
	}),
)
