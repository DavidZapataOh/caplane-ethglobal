/**
 * A policy denial, told apart from the other controls that also answer 400.
 * `insufficient_funds` comes from simulation and `insufficient_correct_authorization_signatures`
 * from the quorum; reporting either as a policy denial would claim a block that never happened.
 */
export const isPolicyViolation = (e: { status?: number; error?: { code?: string } }): boolean =>
  e.status === 400 && e.error?.code === 'policy_violation'

/**
 * Produces the denial evidence. Run directly; importing this module for the tests above does
 * not execute it.
 *
 * Three choices decide whether the artifact is worth anything.
 *
 * `eth_signTransaction`, not `eth_sendTransaction`: for operations Privy also broadcasts,
 * simulation runs before policy evaluation, so an unfunded wallet fails with the wrong code.
 *
 * The wallet carries no quorum owner. A quorum-owned wallet would answer
 * `insufficient_correct_authorization_signatures` — a real block, but by a different control,
 * and an artifact that conflates two controls proves neither.
 *
 * The policy carries an explicit ALLOW alongside the DENY. Evaluation is deny-by-default per
 * method, so without it the refusal would be attributable to "no rule matched" rather than to
 * the rule being demonstrated.
 */
if (import.meta.main) {
	const { ARC, privy } = await import('./client')
	const client = privy()

	const BLOCKED = '0x000000000000000000000000000000000000dEaD'
	const wallet = await client.wallets().create({ chain_type: 'ethereum' })
	const ALLOWED = wallet.address

	const policy = await client.policies().create({
		name: 'caplane-throwaway denial evidence',
		version: '1.0',
		chain_type: 'ethereum',
		rules: [
			{
				name: 'Deny the blocked recipient',
				method: 'eth_signTransaction',
				action: 'DENY',
				conditions: [
					{
						field_source: 'ethereum_transaction',
						field: 'to',
						operator: 'eq',
						value: BLOCKED,
					},
				],
			},
			{
				name: 'Allow the control recipient',
				method: 'eth_signTransaction',
				action: 'ALLOW',
				// An empty condition list is rejected outright, and there is no negating
				// operator, so "allow everything else" cannot be expressed. An explicit
				// single-address allow does the same job for this artifact: one recipient
				// signs, one does not, and both outcomes are attributable to a named rule.
				conditions: [
					{
						field_source: 'ethereum_transaction',
						field: 'to',
						operator: 'eq',
						value: ALLOWED,
					},
				],
			},
		],
	})
	await client.wallets().update(wallet.id, { policy_ids: [policy.id] })
	console.log(`wallet: ${wallet.id}  ${wallet.address}\npolicy: ${policy.id}\n`)

	const sign = (to: string) =>
		client
			.wallets()
			.ethereum()
			.signTransaction(wallet.id, {
				params: {
					transaction: {
						to,
						value: '0x0',
						chain_id: ARC.chainId,
						type: 2,
						nonce: '0x0',
						max_fee_per_gas: ARC.maxFeePerGas,
						max_priority_fee_per_gas: ARC.maxPriorityFeePerGas,
						gas_limit: ARC.gasLimit,
					},
				},
			})

	// The control run is what answers "your own code threw the exception": the same request
	// with an allowed recipient returns a signature, over the same wire, in the same execution.
	const control = await sign(ALLOWED)
	console.log(`control  -> signed, ${control.signed_transaction.length} chars`)

	let denied: unknown
	try {
		await sign(BLOCKED)
		console.error('\nFAIL: the blocked recipient was signed. The evidence is void.')
		process.exit(1)
	} catch (error) {
		denied = error
	}

	const e = denied as { status?: number; error?: { code?: string } }
	console.log(`denied   -> status ${e.status} code ${e.error?.code}`)
	if (!isPolicyViolation(e)) {
		console.error('\nFAIL: refused, but not by the policy. Wrong artifact.')
		process.exit(1)
	}
	console.log('\nthe policy discriminates: allowed signs, blocked does not')
	console.log(JSON.stringify({ status: e.status, error: e.error }, null, 2))

	if (process.argv.includes('--teardown')) {
		// Detaching comes first: deleting a policy that is still attached is refused with
		// "Policy has associated wallets".
		await client.wallets().update(wallet.id, { policy_ids: [] })
		await client.policies().delete(policy.id, {})
		await client.wallets().archive(wallet.id)
		console.log(`\nteardown: policy ${policy.id} deleted, wallet ${wallet.id} archived`)
	}
}
