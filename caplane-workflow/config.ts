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
	/**
	 * The organisation's jurisdiction, ISO 3166-1 alpha-2. A claim component, and one the enclave
	 * must not take from the submitter: it is checked against nothing, so leaving it to the claim
	 * let two edited fields drop the collision agreement below its threshold.
	 */
	ledgerCountry: z.string().regex(/^[A-Z]{2}$/),
	watchlistUrl: z.string().regex(/^https:\/\//),
	/**
	 * The public vehicle register. Two hosts because they are two services: the decoder and the
	 * recall list. Neither needs a credential, which is what lets a second instrument exist at all —
	 * the secret ring is at a documented ceiling of five with no room for a sixth.
	 */
	vinApiBase: z.string().regex(/^https:\/\//),
	recallsApiBase: z.string().regex(/^https:\/\//),
	registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
	/** Emits `Settled` once per lien and never again, which is what makes it safe as a trigger. */
	escrowAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
	/**
	 * Read by raw JSON-RPC rather than by the EVM capability: every method on that capability
	 * takes the ordinary runtime, and obtaining one inside a TEE handler means going back through
	 * the DONs, which routes the request out of the enclave and hands node operators the commitment
	 * being asked about.
	 *
	 * Not a secret, and could not be one: it carries no credential, and the secret ring already
	 * sits at the documented ceiling of five.
	 */
	rpcUrl: z.string().regex(/^https:\/\//),

	/**
	 * The underwriting policy, in configuration rather than in the vault, and deliberately so.
	 * The secret ring sits exactly at the documented ceiling of five and every one of them has a
	 * reader; and a published underwriting policy is the same call the collision threshold makes,
	 * where publishing it is what makes the measured rate checkable at all. Hiding it would buy no
	 * confidentiality and cost one more name to keep synchronised.
	 *
	 * Strings, not numbers: JSON has no bigint and the amounts are compared and scaled as such.
	 */
	advanceRateBps: z.string().regex(/^[0-9]{1,5}$/),
	feeRateBps: z.string().regex(/^[0-9]{1,5}$/),
	/**
	 * What the advance rate applies to — and NOT the claim's own amount, which cannot be used:
	 * the claim is denominated in the ledger's currency, the pool settles in USDC, and nothing in
	 * this system converts between them. Assigning the claim's minor units into a six-decimal
	 * field would be a scale error wearing the costume of a policy.
	 */
	settlementBaseUsdc6: z.string().regex(/^[0-9]+$/),
	/** Seconds added to the due date. The pool refuses to disburse at or past expiry. */
	graceSeconds: z.string().regex(/^[0-9]+$/),
})

export type Config = z.infer<typeof configSchema>
