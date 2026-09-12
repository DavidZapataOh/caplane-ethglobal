import { cre, prepareReportRequest } from '@chainlink/cre-sdk'
import type { ReportRequestJson, TeeRuntime } from '@chainlink/cre-sdk'
import { type Hex, encodeAbiParameters, encodePacked, keccak256, parseAbiParameters } from 'viem'
import { CHAIN, RejectReason, ReportKind } from './abi/frozen'
import type { Config } from './config'
import type { Verdict } from './registry'
import type { Verification } from './verify'

export type Facts = {
	authorized: boolean
	confirmed: boolean
	verified: Omit<Verification, 'invoice'>
	collision: Verdict
	dueDate: string
}

export type Policy = Pick<
	Config,
	'advanceRateBps' | 'feeRateBps' | 'settlementBaseUsdc6' | 'graceSeconds'
>

export type Decision =
	| { kind: typeof ReportKind.Record; advanceUsdc6: bigint; rateBps: number; expiresAt: bigint }
	| { kind: typeof ReportKind.Reject; reason: number }

/**
 * Days from civil, then seconds. No `Date`: the determinism validator rejects it, and its parsing
 * of anything but a full ISO date is runtime-dependent. Checked against five dates including a
 * leap day and a non-leap century year.
 */
export const epochOf = (iso: string): bigint => {
	const [year, month, day] = iso.split('-').map(Number) as [number, number, number]
	const shifted = year - (month <= 2 ? 1 : 0)
	const era = Math.floor(shifted / 400)
	const yearOfEra = shifted - era * 400
	const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
	const dayOfEra =
		yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
	return BigInt(era * 146_097 + dayOfEra - 719_468) * 86_400n
}

/**
 * Ordered so the reason names the earliest thing that failed, not the last one checked.
 *
 * `undecidable` lands in the same arm as `collision`, deliberately. A registry that could not
 * answer and a registry that said no are not the same thing — but neither of them approves, and
 * separating them on chain would cost a new code for information the event already carries well
 * enough to refuse on.
 */
const refusalOf = (facts: Facts): number | undefined => {
	if (!facts.authorized) return RejectReason.UnauthorizedSubmitter
	if (!facts.verified.exists || !facts.verified.unpaid || !facts.verified.matches) {
		return RejectReason.SourceUnverified
	}
	if (!facts.verified.screened) return RejectReason.ComplianceHit
	if (!facts.confirmed) return RejectReason.DebtorUnconfirmed
	if (facts.collision.status !== 'clear') return RejectReason.AlreadyEncumbered
	return undefined
}

/**
 * The advance rate is real policy — what fraction of a receivable's value is advanced. The base it
 * applies to is not the claim's own amount, and cannot be: the claim is denominated in the ledger's
 * currency, the pool settles in USDC, and nothing in this system converts between them. Assigning
 * the claim's minor units into a six-decimal field would be a scale error dressed as a number, so
 * the base is a configured settlement figure and the size of the advance is demo-scaled on purpose.
 *
 * Neither rate is derived from anything. There is no default history and no pricing model in this
 * repository, and there will not be one; they are published in configuration precisely so that is
 * visible. What the system demonstrates is the mechanism, not that the numbers are right.
 */
export const underwrite = (facts: Facts, policy: Policy, nowSeconds: bigint): Decision => {
	const reason = refusalOf(facts)
	if (reason !== undefined) return { kind: ReportKind.Reject, reason }

	const expiresAt = epochOf(facts.dueDate) + BigInt(policy.graceSeconds)
	// An already-expired lien is worse than a refusal. The pool will not disburse at or past
	// expiry, nothing produces a Default report, and a lien cannot be released without a
	// settlement — so it sits Active for ever, blocking this receivable and every near-variant of
	// it, with no on-chain explanation and no recovery path in a contract that has no owner.
	// An invoice more than the grace period overdue is the most ordinary input in factoring.
	if (expiresAt <= nowSeconds) return { kind: ReportKind.Reject, reason: RejectReason.SourceUnverified }

	return {
		kind: ReportKind.Record,
		advanceUsdc6: (BigInt(policy.settlementBaseUsdc6) * BigInt(policy.advanceRateBps)) / 10_000n,
		rateBps: Number(policy.feeRateBps),
		expiresAt,
	}
}

/**
 * The registry remembers every nonce it has seen and refuses a repeat, for ever. The kind is in
 * the preimage because the same lien is later released or defaulted, and those reports would
 * otherwise collide with this one — a revert nobody would see until the workflow was deployed.
 *
 * Derived, never drawn: the enclave has no entropy, and two nodes disagreeing on a nonce is a
 * report that never reaches consensus.
 *
 * What it does not protect against: two copyists submitting the same claim get different
 * submission ids — the inbox derives one from `keccak(sender ‖ ciphertext)` — so both reports
 * pass the replay guard and the second reverts inside the registry with `AlreadyEncumbered`. A
 * revert in `onReport` emits nothing, so that second submitter gets no event and no trace. The
 * in-enclave collision check closes it only once the first lien is mined.
 */
export const nonceFor = (trigger: Hex, kind: number): Hex =>
	keccak256(encodePacked(['bytes32', 'uint8'], [trigger, kind]))

export type ReportBody = {
	kind: number
	chainSelector: bigint
	nonce: Hex
	lienId: Hex
	submissionId: Hex
	borrower: Hex
	advanceUsdc6: bigint
	rateBps: number
	expiresAt: bigint
	componentCommitments: Hex[]
}

/**
 * The flat field order the registry decodes, and nothing else. Widths matter: the three
 * `bigint` fields exceed what a `number` holds, and the frozen ABI predeclares which is which.
 */
export const encodeReportBody = (body: ReportBody): Hex =>
	encodeAbiParameters(
		parseAbiParameters(
			'uint8, uint64, bytes32, bytes32, bytes32, address, uint128, uint32, uint64, bytes32[]',
		),
		[
			body.kind,
			body.chainSelector,
			body.nonce,
			body.lienId,
			body.submissionId,
			body.borrower,
			body.advanceUsdc6,
			body.rateBps,
			body.expiresAt,
			body.componentCommitments,
		],
	)

/** Their helper, not ours: it applies `evm`/`ecdsa`/`keccak256` and does the hex-to-base64 step. */
export const reportPayload = (body: ReportBody): ReportRequestJson =>
	prepareReportRequest(encodeReportBody(body))

/**
 * The only place in this package that leaves the enclave. Both handlers come through here, so the
 * crossing is one line to audit rather than one per report kind, and a test pins the count at one
 * while the callers are two.
 *
 * It lives beside the encoder rather than beside the handlers because the settlement handler
 * already imports this module; putting it in the handler file would make that a cycle — the same
 * shape the config module was extracted to break.
 */
export const submitReport = (runtime: TeeRuntime<Config>, body: ReportBody): void => {
	const donRuntime = runtime.usingTheDons()
	const report = donRuntime.report(reportPayload(body)).result()
	new cre.capabilities.EVMClient(CHAIN.arcTestnet.chainSelector)
		.writeReport(donRuntime, { receiver: runtime.config.registryAddress as Hex, report })
		.result()
}
