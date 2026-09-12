import { type EVMLog, type TeeRuntime, cre, logTriggerConfig } from '@chainlink/cre-sdk'
import { type Hex, bytesToHex, decodeEventLog, hexToBytes, toEventSelector } from 'viem'
import { z } from 'zod'
import { inboxAbi } from './abi'
import { CHAIN } from './abi/frozen'
import { open } from './envelope'

export const configSchema = z.object({
	inboxAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
})
type Config = z.infer<typeof configSchema>

/**
 * The registration filters on this and on nothing else, so a wrong value produces a subscription
 * that can never fire — with no error, because the filter is syntactically fine. Derived from the
 * signature rather than typed out, for the same reason the chain selector is read from the frozen
 * copy: a 32-byte literal transcribed by hand fails in a way nothing reports.
 */
export const CLAIM_SUBMITTED_TOPIC = toEventSelector('ClaimSubmitted(bytes32,address,bytes)')

export type Claim = {
	submissionId: Hex
	submitter: Hex
	envelope: Hex
	envelopeBytes: number
}

/**
 * The log arrives as raw bytes — the SDK does no ABI decoding at all — so the topics and the
 * data are handed to viem with the frozen ABI rather than sliced by hand.
 */
export const decodeClaimSubmitted = (log: {
	topics: readonly Uint8Array[]
	data: Uint8Array
}): Claim => {
	const { args } = decodeEventLog({
		abi: inboxAbi,
		eventName: 'ClaimSubmitted',
		// Not point-free: `Array.map` passes the index as viem's second parameter and the call
		// stops typechecking.
		topics: log.topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]],
		data: bytesToHex(log.data),
	})
	return {
		submissionId: args.submissionId,
		submitter: args.submitter,
		// The envelope itself, not `log.data`: that is the ABI encoding of a `bytes` — an offset
		// word, a length word and padded payload — so an 81-byte envelope arrives as 160 bytes.
		envelope: args.ciphertext,
		envelopeBytes: (args.ciphertext.length - 2) / 2,
	}
}

/**
 * Runs inside the enclave. It reads nothing off chain and calls nobody: every EVM method on this
 * SDK takes the ordinary runtime, so a read would mean `usingTheDons()`, which routes the request
 * out of the enclave. Nothing here needs one.
 *
 * No logging. Log output is not visible for a TEE trigger, so a handler that leaned on it would
 * be debugging into a void — and anything that did escape would stop being confidential.
 */
export const onClaimSubmitted = (runtime: TeeRuntime<Config>, log: EVMLog): string => {
	const claim = decodeClaimSubmitted(log)

	// One batch call spends one unit against the five-per-execution secrets quota. The value
	// arrives as a string, so the key travels as hex and is decoded here. `namespace` is omitted:
	// `main` is the SDK's default and the only namespace the CLI can write.
	const secrets = runtime.getSecrets([{ id: 'ENCLAVE_ENVELOPE_KEY' }]).result()
	const opened = open(
		hexToBytes(claim.envelope),
		hexToBytes(secrets.ENCLAVE_ENVELOPE_KEY.value as Hex),
	)

	// The event's submitter is the address that paid for the transaction; the envelope names the
	// address its sealer authorised. A relay of somebody else's ciphertext differs here, and this
	// is the only place in the system that can tell.
	const authorized =
		bytesToHex(opened.authorizedSubmitter).toLowerCase() === claim.submitter.toLowerCase()

	// The length and a verdict, never the content: what this returns is the only thing that
	// leaves, and returning the plaintext would turn the one-way door into a window.
	return `${claim.submissionId} ${claim.submitter} ${opened.claim.length} ${authorized}`
}

export function initWorkflow(config: Config) {
	const evm = new cre.capabilities.EVMClient(CHAIN.arcTestnet.chainSelector)
	return [
		cre.handlerInTee(
			evm.logTrigger(
				logTriggerConfig({
					addresses: [config.inboxAddress as Hex],
					// One address, one signature. A filter carrying several of either takes the
					// cross product, so a second event gets its own trigger and its own handler.
					topics: [[CLAIM_SUBMITTED_TOPIC]],
					// Deliberate, not defaulted: a lien is a permanent record, so the workflow
					// waits for the block to be beyond reorg rather than reacting to the tip.
					confidence: 'FINALIZED',
				}),
			),
			onClaimSubmitted,
			[{ tee: 'nitro', regions: ['us-west-2'] }],
		),
	]
}
