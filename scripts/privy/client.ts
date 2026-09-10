import { PrivyClient } from '@privy-io/node'

export const required = (name: string): string => {
	const value = process.env[name]
	if (!value) throw new Error(`missing required environment variable: ${name}`)
	return value
}

/** The app id is public and ships in the browser bundle; only the secret is a credential. */
export const privy = () =>
	new PrivyClient({
		appId: required('NEXT_PUBLIC_PRIVY_PUBLIC_APP'),
		appSecret: required('PRIVY_SERVER_CREDENTIAL'),
	})

export const ARC = {
	chainId: 5042002,
	caip2: 'eip155:5042002',
	explorer: 'https://testnet.arcscan.app',
	/** Above Arc's base-fee floor. An underpriced transaction is dropped with no error. */
	maxFeePerGas: '0x6fc23ac00',
	maxPriorityFeePerGas: '0x3b9aca00',
	gasLimit: '0x5208',
} as const

export const rpc = async (method: string, params: unknown[]): Promise<string> => {
	const response = await fetch(required('ARC_TESTNET_RPC_URL'), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
	})
	const body = (await response.json()) as { result?: string; error?: { message: string } }
	if (body.error) throw new Error(`${method}: ${body.error.message}`)
	return body.result as string
}
