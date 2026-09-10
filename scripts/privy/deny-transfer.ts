#!/usr/bin/env bun
import { privy } from './client'
import { isPolicyViolation } from './deny'

/**
 * The second denial. This one is evaluated at the API layer rather than in the enclave, and
 * that is exactly why it is worth recording: it leaves a persisted, fetchable action record,
 * which the enclave-evaluated path does not.
 *
 * It does not run on the registry's chain. Transfers accept a fixed set of named chains and
 * Arc is not among them, so the chain here is incidental — the policy engine is the subject.
 */

const client = privy()
const BLOCKED = '0x000000000000000000000000000000000000dEaD'

const wallet = await client.wallets().create({ chain_type: 'ethereum' })
const policy = await client.policies().create({
	name: 'caplane-throwaway transfer denial',
	version: '1.0',
	chain_type: 'ethereum',
	rules: [
		{
			name: 'Deny the blocked recipient',
			method: 'eth_sendTransaction',
			action: 'DENY',
			conditions: [
				{ field_source: 'ethereum_transaction', field: 'to', operator: 'eq', value: BLOCKED },
			],
		},
	],
})
await client.wallets().update(wallet.id, { policy_ids: [policy.id] })
console.log(`wallet: ${wallet.id}  ${wallet.address}\npolicy: ${policy.id}\n`)

try {
	const action = await client.wallets().transfer(wallet.id, {
		source: { asset: 'usdc', chain: 'base-sepolia' },
		destination: { address: BLOCKED },
		amount: '1000000',
	})
	console.log('accepted:', JSON.stringify(action).slice(0, 300))
} catch (error) {
	const e = error as { status?: number; error?: unknown }
	console.log(`refused: status ${e.status}`)
	console.log(JSON.stringify(e.error, null, 2))
	console.log(`isPolicyViolation: ${isPolicyViolation(e as never)}`)
}

if (process.argv.includes('--teardown')) {
	// Detaching comes first: deleting a policy that is still attached is refused with
	// "Policy has associated wallets".
	await client.wallets().update(wallet.id, { policy_ids: [] })
	await client.policies().delete(policy.id, {})
	await client.wallets().archive(wallet.id)
	console.log(`\nteardown: policy deleted, wallet archived`)
}
