import { type EVMLog, type TeeRuntime, cre, logTriggerConfig } from '@chainlink/cre-sdk'
import { type Hex, bytesToHex, decodeEventLog, toEventSelector } from 'viem'
import { z } from 'zod'
import { inboxAbi } from './abi'
import { CHAIN } from './abi/frozen'

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
export const onClaimSubmitted = (_runtime: TeeRuntime<Config>, log: EVMLog): string => {
	const claim = decodeClaimSubmitted(log)
	return `${claim.submissionId} ${claim.submitter} ${claim.envelopeBytes}`
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
