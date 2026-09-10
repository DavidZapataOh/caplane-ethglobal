#!/usr/bin/env bun
import { privy } from './client'

/** Removes throwaway state left by an interrupted run. Ids are passed in, never discovered. */
const client = privy()
const arg = (flag: string) => process.argv.filter((_, i) => process.argv[i - 1] === flag)

// The SDK's archive helper sends no body and the endpoint rejects that with
// "Expected application/json request body", so archiving goes over REST directly.
const archive = async (walletId: string) => {
	const credentials = btoa(
		`${process.env.NEXT_PUBLIC_PRIVY_PUBLIC_APP}:${process.env.PRIVY_SERVER_CREDENTIAL}`,
	)
	const response = await fetch(`https://api.privy.io/v1/wallets/${walletId}/archive`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${credentials}`,
			'privy-app-id': process.env.NEXT_PUBLIC_PRIVY_PUBLIC_APP!,
			'Content-Type': 'application/json',
		},
		body: '{}',
	})
	return `${response.status}`
}

/** One unreachable item must not strand the rest: a quorum-owned wallet cannot be modified
 *  from a later process, and that is a known outcome rather than a reason to stop. */
const attempt = async (label: string, work: () => Promise<unknown>) => {
	try {
		await work()
		console.log(`ok   ${label}`)
	} catch (error) {
		const e = error as { error?: { error?: string } }
		console.log(`skip ${label} — ${e.error?.error ?? String(error).slice(0, 80)}`)
	}
}

for (const walletId of arg('--wallet')) {
	await attempt(`wallet ${walletId}`, async () => {
		await client.wallets().update(walletId, { policy_ids: [] })
		await archive(walletId)
	})
}
for (const policyId of arg('--policy')) {
	await attempt(`policy ${policyId}`, () => client.policies().delete(policyId, {}))
}
for (const organizationId of arg('--organization')) {
	await attempt(`organization ${organizationId}`, () =>
		client.organizations().delete(organizationId),
	)
}
