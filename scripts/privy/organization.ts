#!/usr/bin/env bun
import { privy } from './client'

/**
 * The quorum-organization-wallet sequence, in the only order the API allows: creating an
 * organization requires an existing key quorum, because `default_key_quorum_id` is a required
 * field. A quorum is therefore not an optional extra; an organization cannot exist without one.
 *
 * Members are P-256 authorization keys generated here and held only in memory. That is why
 * creation and teardown run in one process: persisting a quorum's private keys to disk to let
 * a later teardown use them would be a worse outcome than leaving the state behind.
 */

const THROWAWAY = 'caplane-throwaway'

const authorizationKey = async () => {
	const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify',
	])
	const spki = await crypto.subtle.exportKey('spki', pair.publicKey)
	return Buffer.from(spki).toString('base64')
}

const client = privy()

const quorum = await client.keyQuorums().create({
	public_keys: [await authorizationKey(), await authorizationKey()],
	authorization_threshold: 2,
	display_name: `${THROWAWAY} admins`,
})
console.log(`key quorum:   ${quorum.id}  threshold=2 of 2`)

const organization = await client.organizations().create({
	display_name: `${THROWAWAY} org`,
	default_key_quorum_id: quorum.id,
})
console.log(`organization: ${organization.id}`)

// Omitting `owner` leaves the organization's default quorum as the wallet's owner, which is
// the point: the wallet answers to a set of signers, not to one loose key.
const wallet = await client.wallets().create({
	chain_type: 'ethereum',
	entity: { id: organization.id, type: 'organization' },
})
console.log(`wallet:       ${wallet.id}  ${wallet.address}`)

console.log('\n--- the wallet belongs to the organization ---')
const owned = await client.wallets().list({ entity_id: organization.id })
for await (const w of owned) console.log(`  ${w.id}  ${w.address}`)

if (process.argv.includes('--teardown')) {
	console.log('\n--- teardown ---')
	await client.organizations().delete(organization.id)
	console.log(`deleted organization ${organization.id}`)
	const left = await client.organizations().list()
	let remaining = 0
	for await (const o of left) if (o.display_name?.startsWith(THROWAWAY)) remaining++
	console.log(`throwaway organizations left: ${remaining}`)
}
