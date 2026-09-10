#!/usr/bin/env bun
import { ARC, privy, rpc } from './client'

/**
 * Whether Privy can sign for chain 5042002 at all. Nothing established this: the chain type is
 * an open string, so the type system permits it and only an executed transaction decides.
 * Both paths are exercised, not just the one that works — the raw signing path is the fallback
 * the architecture would need, and finding out it works only when it is needed is too late.
 */

const client = privy()

// Reusing a wallet across runs is not a convenience: gas on Arc is paid in the native asset,
// so a fresh wallet has to be funded before it can send anything, and creating a new one per
// attempt would strand funds in an address nothing else uses.
const existing = process.argv.indexOf('--wallet')
const wallet =
	existing === -1
		? await client.wallets().create({ chain_type: 'ethereum' })
		: await client.wallets().get(process.argv[existing + 1]!)
console.log(`wallet:  ${wallet.id}  ${wallet.address}`)

const balance = BigInt(await rpc('eth_getBalance', [wallet.address, 'latest']))
console.log(`balance: ${balance} wei`)
if (balance === 0n) {
	console.error(`\nfund ${wallet.address} first, then rerun with --wallet ${wallet.id}`)
	process.exit(1)
}

console.log('\n--- path 1: Privy signs and broadcasts ---')
let hash: string | null = null
try {
	const sent = await client.wallets().ethereum().sendTransaction(wallet.id, {
		caip2: ARC.caip2,
		params: {
			transaction: {
				to: wallet.address,
				value: '0x0',
				chain_id: ARC.chainId,
				type: 2,
				max_fee_per_gas: ARC.maxFeePerGas,
				max_priority_fee_per_gas: ARC.maxPriorityFeePerGas,
				gas_limit: ARC.gasLimit,
			},
		},
	})
	hash = sent.hash
	console.log(`hash:    ${hash}`)
	console.log(`explorer: ${ARC.explorer}/tx/${hash}`)
} catch (error) {
	// Broadcasting is gated per app and per chain, separately from the type system. Recorded
	// rather than fatal: path 2 is what decides whether the architecture survives this.
	const e = error as { status?: number; error?: { error?: string } }
	console.log(`refused: ${e.status} ${JSON.stringify(e.error)}`)
}

console.log('\n--- path 2: Privy signs, we broadcast ---')
const nonce = await rpc('eth_getTransactionCount', [wallet.address, 'pending'])
const signed = await client.wallets().ethereum().signTransaction(wallet.id, {
	params: {
		transaction: {
			to: wallet.address,
			value: '0x0',
			chain_id: ARC.chainId,
			type: 2,
			nonce,
			max_fee_per_gas: ARC.maxFeePerGas,
			max_priority_fee_per_gas: ARC.maxPriorityFeePerGas,
			gas_limit: ARC.gasLimit,
		},
	},
})
const raw = signed.signed_transaction
const ownHash = await rpc('eth_sendRawTransaction', [raw])
console.log(`hash:    ${ownHash}`)
console.log(`explorer: ${ARC.explorer}/tx/${ownHash}`)

console.log('\n--- receipts ---')
for (const h of [hash, ownHash].filter((x): x is string => x !== null)) {
	const receipt = (await rpc('eth_getTransactionReceipt', [h])) as unknown as {
		status?: string
		from?: string
	} | null
	console.log(`${h}  status=${receipt?.status ?? 'pending'}  from=${receipt?.from ?? '-'}`)
}
console.log(`\nwallet id for teardown: ${wallet.id}`)
