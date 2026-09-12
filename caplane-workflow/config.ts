import { z } from 'zod'

/**
 * Its own module so the handler and the verification can both hold the type. They import each
 * other's work — the handler calls the verification, the verification needs the config shape —
 * and leaving the schema in the handler makes that a cycle.
 */
export const configSchema = z.object({
	inboxAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
	ledgerTokenUrl: z.string().regex(/^https:\/\//),
	ledgerApiBase: z.string().regex(/^https:\/\//),
	/**
	 * Names the accounting organisation and authorises nothing: without the bearer token from
	 * the call before it, it opens nothing. That is why it may travel in configuration, which
	 * ships in the clear, while the application's id and passphrase live in the vault.
	 *
	 * It is here rather than read at runtime because resolving it costs an HTTP call, and the
	 * quota is five for the whole execution.
	 */
	ledgerTenantId: z.string().regex(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/),
	watchlistUrl: z.string().regex(/^https:\/\//),
	registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
	/**
	 * Read by raw JSON-RPC rather than by the EVM capability: every method on that capability
	 * takes the ordinary runtime, and obtaining one inside a TEE handler means `usingTheDons()`,
	 * which routes the request back out and hands node operators the commitment being asked about.
	 *
	 * Not a secret, and could not be one: it carries no credential, and the secret ring already
	 * sits at the documented ceiling of five.
	 */
	rpcUrl: z.string().regex(/^https:\/\//),
})

export type Config = z.infer<typeof configSchema>
