import { type EVMLog, type TeeRuntime, cre, logTriggerConfig } from '@chainlink/cre-sdk'
import { type Hex, bytesToHex, decodeEventLog, hexToBytes, toEventSelector, zeroHash } from 'viem'
import { inboxAbi } from './abi'
import { CHAIN } from './abi/frozen'
import type { Config } from './config'
import { blockNumberOf, confirmationBinds, recoverConfirmer } from './attestation'
import { open } from './envelope'
import { lienIdOf } from '../claim/commit'
import { toComponents } from '../claim/index'
import { ClaimType, RejectReason, ReportKind } from './abi/frozen'
import { type Decision, nonceFor, submitReport, underwrite } from './report'
import { SETTLED_TOPIC, onAdvanceSettled } from './settlement'
import { type SubmittedClaim, bindToLedger, decodeClaim } from './ledger'
import { secretBytes } from './secrets'
import { type Verdict, readRegistry, verdictOf } from './registry'
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

	const blockNumber = blockNumberOf(log)
	const secrets = runtime.getSecrets(SECRET_IDS.map((id) => ({ id }))).result()
	// The envelope is opened inside the guard too. It is the one input nobody controls: the inbox
	// is permissionless, so any bytes at all reach here, and a sealer using a stale enclave key
	// produces the same failure by accident. An uncaught throw would emit no report.
	let opened: { authorizedSubmitter: Uint8Array; claim: Uint8Array } | undefined
	let authorized = false
	try {
		opened = open(
			hexToBytes(claim.envelope),
			secretBytes('ENCLAVE_ENVELOPE_KEY', secrets.ENCLAVE_ENVELOPE_KEY.value),
		)
		// The event's submitter is the address that paid for the transaction; the envelope names
		// the address its sealer authorised. A relay of somebody else's ciphertext differs here,
		// and this is the only place in the system that can tell.
		authorized =
			bytesToHex(opened.authorizedSubmitter).toLowerCase() === claim.submitter.toLowerCase()
	} catch {
		opened = undefined
	}

	// Three calls cost a token exchange and two queries. A claim whose sealer did not authorise
	// this submitter is refused whatever the ledger says, so verifying it buys nothing and
	// spends the quota the collision check still needs.
	// Everything a submitter controls is decoded, canonicalised and verified inside this guard.
	//
	// Each of these steps used to throw straight out of the handler, and an uncaught throw emits no
	// report at all: the submitter paid gas, the inbox permanently consumed their submission id,
	// and nothing on chain recorded that the claim was ever seen. The rule was already written
	// down where the signature is recovered — "a malformed signature must be a refusal" — and
	// honoured in that one place out of eight. This is the rest of it.
	//
	// The two reasons are distinguishable because the remediations are: a malformed document is
	// the submitter's to fix, an unreachable ledger is nobody's. Neither is "already pledged",
	// which is what an RPC outage used to publish.
	let submitted: SubmittedClaim | undefined
	let verified = UNVERIFIED
	let collision: Verdict = { status: 'undecidable', reason: 'not evaluated' }
	let commitments: Hex[] = []
	let confirmed = false
	let lienId: Hex = zeroHash
	let failure: number | undefined

	if (opened === undefined) {
		failure = RejectReason.MalformedEnvelope
	} else if (authorized) {
		try {
			const declared = decodeClaim(opened.claim)
			verified = verifyExternally(runtime, secrets, declared)
			// Bound to what the enclave knows before anything is derived from it.
			submitted = verified.invoice
				? bindToLedger(declared, verified.invoice, config.ledgerTenantId, config.ledgerCountry)
				: undefined
			// A trigger with no block height cannot pin the registry read, and an unpinned read is
			// the race this guard exists to remove. Refuse rather than fall back to the tip.
			if (blockNumber === undefined) throw new Error('trigger carried no block height')
			if (submitted !== undefined) {
				const read = readRegistry(runtime, secrets, submitted, blockNumber)
				collision = verdictOf(read.read)
				commitments = read.commitments
				lienId = lienIdOf(
					ClaimType.Invoice,
					toComponents(submitted),
					secretBytes('COMMITMENT_PEPPER', secrets.COMMITMENT_PEPPER.value),
				)
				// Inside the guard too: this derives the claim id, which canonicalises every
				// component and throws on any the submitter malformed.
				confirmed = confirmationBinds(
					submitted.confirmation,
					recoverConfirmer(
						submitted.confirmation,
						submitted.signature as Hex,
						config.registryAddress as Hex,
					),
					submitted,
					verified.invoice ?? {},
					claim.submitter,
					blockNumber,
				)
			}
		} catch (error) {
			// A ClaimError names the component and nothing else; anything else is infrastructure.
			failure =
				(error as Error).name === 'ClaimError'
					? RejectReason.MalformedClaim
					: RejectReason.VerificationUnavailable
		}
	} else {
		failure = RejectReason.UnauthorizedSubmitter
	}

	const decision: Decision =
		failure !== undefined
			? { kind: ReportKind.Reject, reason: failure }
			: underwrite(
					{ authorized, confirmed, verified, collision, dueDate: submitted?.dueDate ?? '1970-01-01' },
					config,
					BigInt(Math.floor(runtime.now().getTime() / 1000)),
				)

	const body = {
		kind: decision.kind,
		chainSelector: CHAIN.arcTestnet.chainSelector,
		nonce: nonceFor(claim.submissionId, decision.kind),
		// Only on a Record. The registry's reject branch never reads this field, and the value is
		// an unpeppered, offline-derivable fingerprint of the claim — published beside the reason
		// it was refused, which for a compliance hit names a third party.
		lienId: decision.kind === ReportKind.Record ? lienId : zeroHash,
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
		componentCommitments: decision.kind === ReportKind.Record ? commitments : [],
	}

	// The single crossing, shared with the settlement handler. Nothing the enclave read goes
	// through it — ten derived fields, and the commitments are peppered hashes whose pepper stays
	// behind. The door is not a filter: it carries exactly what the payload carries, which is why
	// this is pinned by a test rather than asserted in a comment.
	submitReport(runtime, body)

	// Two identifiers already public in the log, and the decision the report carries anyway.
	//
	// This used to carry all six verdicts independently. `refusalOf` is ordered so only the
	// earliest failure reaches the chain, and `SourceUnverified` deliberately merges three of
	// them — the return value defeated both, publishing whether the debtor was sanctioned and
	// whether the receivable was already pledged for every claim, including rejected ones.
	return `${claim.submissionId} ${claim.submitter} ${decision.kind}`
}

/**
 * One approved constraint, written once. Typed as a mutable tuple rather than `as const`: the
 * SDK's parameter is mutable and a readonly tuple is not assignable to it.
 */
const TEE: [{ tee: 'nitro'; regions: ['us-west-2'] }] = [{ tee: 'nitro', regions: ['us-west-2'] }]

/**
 * Two subscriptions of a limit of ten, and routing is by POSITION in this array — index 0 is the
 * submission, index 1 the settlement, which is what `--trigger-index` selects. Two triggers rather
 * than one carrying both addresses: a filter with several addresses and several signatures takes
 * the cross product, not the pairing.
 *
 * The 10-events-per-6s rate limit is shared between them, so this divides that budget.
 */
export function initWorkflow(config: Config) {
	const evm = new cre.capabilities.EVMClient(CHAIN.arcTestnet.chainSelector)
	return [
		cre.handlerInTee(
			evm.logTrigger(
				logTriggerConfig({
					addresses: [config.inboxAddress as Hex],
					topics: [[CLAIM_SUBMITTED_TOPIC]],
					// Deliberate, not defaulted: a lien is a permanent record, so the workflow
					// waits for the block to be beyond reorg rather than reacting to the tip.
					confidence: 'FINALIZED',
				}),
			),
			onClaimSubmitted,
			TEE,
		),
		cre.handlerInTee(
			evm.logTrigger(
				logTriggerConfig({
					addresses: [config.escrowAddress as Hex],
					topics: [[SETTLED_TOPIC]],
					// Same reason as the first: a release is permanent too.
					confidence: 'FINALIZED',
				}),
			),
			onAdvanceSettled,
			TEE,
		),
	]
}
