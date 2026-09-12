import { type EVMLog, type TeeRuntime, cre, logTriggerConfig } from '@chainlink/cre-sdk'
import { type Hex, bytesToHex, decodeEventLog, hexToBytes, toEventSelector } from 'viem'
import { inboxAbi } from './abi'
import { CHAIN } from './abi/frozen'
import type { Config } from './config'
import { blockNumberOf, confirmationBinds, recoverConfirmer } from './attestation'
import { open } from './envelope'
import { lienIdOf } from '../claim/commit'
import { toComponents } from '../claim/index'
import { ClaimType, RejectReason, ReportKind } from './abi/frozen'
import { encodeReportBody, nonceFor, reportPayload, underwrite } from './report'
import { decodeClaim } from './ledger'
import { readRegistry, verdictOf } from './registry'
import { UNVERIFIED, verifyExternally } from './verify'

/**
 * The registration filters on this and on nothing else, so a wrong value produces a subscription
 * that can never fire — with no error, because the filter is syntactically fine. Derived from the
 * signature rather than typed out, for the same reason the chain selector is read from the frozen
 * copy: a 32-byte literal transcribed by hand fails in a way nothing reports.
 */
export const CLAIM_SUBMITTED_TOPIC = toEventSelector('ClaimSubmitted(bytes32,address,bytes)')

/**
 * Every secret the enclave needs, fetched in one call. The quota is five calls per execution and
 * a batch of any size spends one of them — the SDK issues a single host call carrying all the
 * requests — so the ring is read once, at the top, and never again.
 *
 * `namespace` is omitted: `main` is the SDK's default and the only namespace the CLI can write.
 * Four of these have no reader yet; they are fetched anyway because a missing id aborts the whole
 * handler, and one upload before this ships is cheaper than four.
 */
export const SECRET_IDS = [
	'ENCLAVE_ENVELOPE_KEY',
	'COMMITMENT_PEPPER',
	'LEDGER_APP_ID',
	'LEDGER_APP_PASSPHRASE',
	'WATCHLIST_SUBSCRIPTION',
] as const

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
 * Runs inside the enclave. It reads nothing off chain: every EVM method on this SDK takes the
 * ordinary runtime, so a read would route the request out of the enclave. Its four outbound calls
 * go out under the TEE runtime instead. The one deliberate crossing is the report, at the end.
 *
 * No logging. The CLI states that for a TEE trigger user logs are not visible and do not leave
 * the TEE, and a deployed execution returned `No logs found` — so a handler that leaned on them
 * would be debugging into a void.
 */
export const onClaimSubmitted = (runtime: TeeRuntime<Config>, log: EVMLog): string => {
	const { config } = runtime
	const claim = decodeClaimSubmitted(log)

	const secrets = runtime.getSecrets(SECRET_IDS.map((id) => ({ id }))).result()
	const opened = open(
		hexToBytes(claim.envelope),
		hexToBytes(secrets.ENCLAVE_ENVELOPE_KEY.value as Hex),
	)

	// The event's submitter is the address that paid for the transaction; the envelope names the
	// address its sealer authorised. A relay of somebody else's ciphertext differs here, and this
	// is the only place in the system that can tell.
	const authorized =
		bytesToHex(opened.authorizedSubmitter).toLowerCase() === claim.submitter.toLowerCase()

	// Three calls cost a token exchange and two queries. A claim whose sealer did not authorise
	// this submitter is refused whatever the ledger says, so verifying it buys nothing and
	// spends the quota the collision check still needs.
	const submitted = authorized ? decodeClaim(opened.claim) : undefined
	const verified = submitted ? verifyExternally(runtime, secrets, submitted) : UNVERIFIED

	// Asked whenever the envelope opened, and never conditioned on what the ledger answered: the
	// count and timing of outbound calls are observable from outside, so branching on a
	// confidential result would leak by metadata what the encryption protects.
	//
	// The seven commitments come back with the verdict. They are derived once, here, from a pepper
	// that never rotates; deriving them again in the report encoder would be two paths to the same
	// bytes, and the day they disagreed nothing would say so.
	const registryRead = submitted
		? readRegistry(runtime, secrets, submitted)
		: { read: { kind: 'error', reason: 'not authorized' } as const, commitments: [] }
	const collision = verdictOf(registryRead.read)

	// The debtor's own signature, recovered here and nowhere else. What it proves is bounded and
	// worth stating: somebody holding a key signed a structure naming this submitter as creditor,
	// over this claim and these exact amounts, pointing at the contact the ledger holds. That the
	// key belongs to that contact is established off chain, by the channel that delivered the
	// request — the ledger stores no chain address, so the enclave has nothing to anchor it to.
	const confirmed =
		submitted !== undefined &&
		confirmationBinds(
			submitted.confirmation,
			recoverConfirmer(
				submitted.confirmation,
				// Both casts are on unvalidated input, and both are safe: recovery returns
				// undefined for anything that is not a 65-byte signature, and the address came
				// through the config schema's own twenty-byte check.
				submitted.signature as Hex,
				config.registryAddress as Hex,
			),
			submitted,
			verified.invoice ?? {},
			claim.submitter,
			blockNumberOf(log),
		)

	// Derived facts only. This return value is the one thing that crosses, and the plaintext's
	// length used to be in it: that was safe while nothing confidential distinguished one claim
	// from another, and stopped being safe the moment the ledger's answer did. A length is the
	// body too — it tells one invoice from another — so it is gone and the verdicts replace it.
	const decision = underwrite(
		{
			authorized,
			confirmed,
			verified,
			collision,
			dueDate: submitted?.dueDate ?? '1970-01-01',
		},
		config,
	)

	const body = {
		kind: decision.kind,
		chainSelector: CHAIN.arcTestnet.chainSelector,
		nonce: nonceFor(claim.submissionId, decision.kind),
		lienId:
			submitted === undefined
				? (`0x${'00'.repeat(32)}` as Hex)
				: lienIdOf(ClaimType.Invoice, toComponents(submitted)),
		submissionId: claim.submissionId,
		// The chain's word, never the plaintext's. This is the custody guard: a copyist relaying
		// somebody else's ciphertext would land the lien on their own address, not the victim's.
		borrower: claim.submitter,
		advanceUsdc6: decision.kind === ReportKind.Record ? decision.advanceUsdc6 : 0n,
		// On a Reject this field carries the reason. Not a shortcut: the frozen schema has no field
		// for one and the registry reads it here, which is why every reason is checked to fit a
		// uint8 before it can be chosen.
		rateBps: decision.kind === ReportKind.Record ? decision.rateBps : decision.reason,
		expiresAt: decision.kind === ReportKind.Record ? decision.expiresAt : 0n,
		componentCommitments: decision.kind === ReportKind.Record ? registryRead.commitments : [],
	}

	// The single crossing. Nothing the enclave read goes through it — ten derived fields, and the
	// commitments are peppered hashes whose pepper stays behind. The door is not a filter: it
	// carries exactly what the payload carries, which is why this is pinned by a test rather than
	// asserted in a comment.
	const donRuntime = runtime.usingTheDons()
	const report = donRuntime.report(reportPayload(body)).result()
	new cre.capabilities.EVMClient(CHAIN.arcTestnet.chainSelector)
		.writeReport(donRuntime, { receiver: config.registryAddress as Hex, report })
		.result()

	return `${claim.submissionId} ${claim.submitter} ${authorized} ${verified.exists} ${verified.unpaid} ${verified.matches} ${verified.screened} ${collision.status} ${confirmed} ${decision.kind}`
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
