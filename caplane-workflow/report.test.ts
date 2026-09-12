import { readFileSync } from 'node:fs'
import golden from '../claim/fixtures/report.json'
import { expect, test } from 'bun:test'
import type { Hex } from 'viem'
import { RejectReason, ReportKind } from './abi/frozen'
import {
	type Policy,
	type ReportBody,
	encodeReportBody,
	epochOf,
	nonceFor,
	underwrite,
} from './report'

// Only the four policy keys: `Config` carries seven more by now, and a whole literal would rot
// every time a sibling plan adds one.
const POLICY: Policy = {
	advanceRateBps: '8000',
	feeRateBps: '200',
	settlementBaseUsdc6: '10000000',
	graceSeconds: '2592000',
}
const NOW = 1_700_000_000n
const CLEAN = {
	authorized: true,
	confirmed: true,
	verified: { exists: true, unpaid: true, matches: true, screened: true },
	collision: { status: 'clear' as const },
	dueDate: '2026-12-31',
}

// Every arm must reject with the reason that names what failed, or the on-chain event tells the
// submitter nothing and the operator debugs by guessing.
test('each failure rejects with its own reason', () => {
	const cases = [
		[{ ...CLEAN, authorized: false }, RejectReason.UnauthorizedSubmitter],
		[{ ...CLEAN, confirmed: false }, RejectReason.DebtorUnconfirmed],
		[{ ...CLEAN, verified: { ...CLEAN.verified, screened: false } }, RejectReason.ComplianceHit],
		[{ ...CLEAN, verified: { ...CLEAN.verified, exists: false } }, RejectReason.SourceUnverified],
		[{ ...CLEAN, verified: { ...CLEAN.verified, matches: false } }, RejectReason.SourceUnverified],
		[{ ...CLEAN, verified: { ...CLEAN.verified, unpaid: false } }, RejectReason.SourceUnverified],
		[
			{ ...CLEAN, collision: { status: 'collision' as const, lienId: `0x${'01'.repeat(32)}` as const } },
			RejectReason.AlreadyEncumbered,
		],
	] as const
	for (const [facts, reason] of cases) {
		const decision = underwrite(facts, POLICY, NOW)
		expect(decision.kind).toBe(ReportKind.Reject)
		expect(decision.kind === ReportKind.Reject && decision.reason).toBe(reason)
	}
})

// A registry that could not answer is not a registry that said no. Approving on `undecidable` is
// how a debtor with too many liens becomes the easiest one to double-pledge.
test('an undecidable collision never approves', () => {
	const decision = underwrite(
		{ ...CLEAN, collision: { status: 'undecidable' as const, reason: 'out of gas' } },
		POLICY,
	)
	expect(decision.kind).toBe(ReportKind.Reject)
})

test('a clean claim records', () => {
	expect(underwrite(CLEAN, POLICY, NOW).kind).toBe(ReportKind.Record)
})

// The reason must be a uint8: it travels in `rateBps`, which the registry reads as the reason for
// a Reject, and a value over 255 would be a different reason on chain than the one chosen here.
test('every reject reason fits the field that carries it', () => {
	for (const reason of Object.values(RejectReason)) expect(reason).toBeLessThanOrEqual(255)
})

// The advance is a fraction of a configured settlement base, never of the claim's own amount:
// those are different currencies with different scales and nothing here converts between them.
// A claim whose amount changes must not move the advance by a single unit.
test('the advance comes from the settlement base, not the claim', () => {
	const base = underwrite(CLEAN, POLICY, NOW)
	const other = underwrite({ ...CLEAN, amountMinor: '1' } as never, POLICY)
	expect(base.kind === ReportKind.Record && base.advanceUsdc6).toBe(8_000_000n)
	expect(other.kind === ReportKind.Record && other.advanceUsdc6).toBe(8_000_000n)
})

// The pool holds sixteen USDC. An advance it cannot fund reverts inside SafeERC20 with no named
// error, so the base times the rate has to stay under what is actually there.
test('the advance fits what the pool holds', () => {
	const decision = underwrite(CLEAN, POLICY, NOW)
	expect(decision.kind === ReportKind.Record && decision.advanceUsdc6).toBeLessThanOrEqual(
		16_000_000n,
	)
})

// The pool refuses to disburse at or past expiry, so an expiry without real headroom pays out an
// advance that is defaultable in the same second. And `Date` is banned on this path.
test('expiry is the due date plus the configured grace, computed without Date', () => {
	const decision = underwrite(CLEAN, POLICY, NOW)
	expect(decision.kind === ReportKind.Record && decision.expiresAt).toBe(1798675200n + 2_592_000n)
})

// Five dates including a leap day and a non-leap century year. Written out because the claim
// package canonicalises dates and never converts them to an epoch, so this had to be new code.
test('the epoch conversion agrees with the calendar on the hard dates', () => {
	expect(epochOf('1970-01-01')).toBe(0n)
	expect(epochOf('2024-02-29')).toBe(1709164800n)
	expect(epochOf('2026-12-31')).toBe(1798675200n)
	expect(epochOf('2100-02-28')).toBe(4107456000n)
	expect(epochOf('2100-03-01')).toBe(4107542400n)
})

// --- the encoder ---------------------------------------------------------------


const bodyFrom = (b: typeof golden.body): ReportBody => ({
	kind: b.kind,
	// Rebuilt with BigInt before encoding: the fixture carries these as strings because
	// `chainSelector` exceeds Number.MAX_SAFE_INTEGER and JSON.parse would round it silently.
	chainSelector: BigInt(b.chainSelector),
	nonce: b.nonce as Hex,
	lienId: b.lienId as Hex,
	submissionId: b.submissionId as Hex,
	borrower: b.borrower as Hex,
	advanceUsdc6: BigInt(b.advanceUsdc6),
	rateBps: b.rateBps,
	expiresAt: BigInt(b.expiresAt),
	componentCommitments: b.componentCommitments as Hex[],
})

const TRIGGER = `0x${'5a'.repeat(32)}` as const

// Two implementations, one committed vector. A TS encoder that drifts from the Solidity one
// produces bytes the registry will decode into a different lien, silently.
test('the typescript encoder reproduces the golden vector byte for byte', () => {
	expect(encodeReportBody(bodyFrom(golden.body))).toBe(golden.encoded)
	expect(encodeReportBody(bodyFrom(golden.rejectBody))).toBe(golden.rejectEncoded)
})

// The registry keeps every used nonce forever. Release and Default arrive later on this same
// lien, so a preimage without the kind makes those reports revert as replays — after deploy.
test('the same lien yields a different nonce for each kind', () => {
	const kinds = [ReportKind.Record, ReportKind.Release, ReportKind.Default, ReportKind.Reject]
	expect(new Set(kinds.map((kind) => nonceFor(TRIGGER, kind))).size).toBe(kinds.length)
})

// And it must be deterministic: the enclave has no entropy, and two nodes disagreeing on a nonce
// is a report that never reaches consensus.
test('the nonce is derived, not drawn', () => {
	expect(nonceFor(TRIGGER, ReportKind.Record)).toBe(nonceFor(TRIGGER, ReportKind.Record))
})

// The client is the only place this is checked: the SDK has no size guard and a body that ran
// over would be discovered in deployment.
test('a record with seven commitments fits the body budget', () => {
	const bytes = encodeReportBody(bodyFrom(golden.body)).length / 2 - 1
	expect(bytes).toBe(576)
	expect(bytes).toBeLessThanOrEqual(5011)
	expect(encodeReportBody(bodyFrom(golden.rejectBody)).length / 2 - 1).toBe(352)
})

// Nothing on this path may reach for a clock or a source of randomness: the enclave has neither,
// and two nodes disagreeing on either is a report that never reaches consensus.
test('the report path is deterministic', () => {
	const source = readFileSync('./report.ts', 'utf8')
	expect(source).not.toMatch(/Date\.now|new Date|Math\.random|toLocaleString/)
})

// The pool refuses to disburse at or past expiry, so a lien recorded already expired can never be
// drawn, never settled, and — with no Default producer — never closed. It permanently blocks the
// receivable and every 6-of-7 variant of it, with no on-chain explanation. An overdue invoice is
// the most ordinary input in factoring, so this is reachable on day one.
test('a claim whose expiry has already passed is refused, not recorded', () => {
	const past = { ...CLEAN, dueDate: '2020-01-01' }
	const decision = underwrite(past, POLICY, 1_800_000_000n)
	expect(decision.kind).toBe(ReportKind.Reject)
	expect(decision.kind === ReportKind.Reject && decision.reason).toBe(RejectReason.SourceUnverified)
})

test('a claim with real headroom still records', () => {
	expect(underwrite(CLEAN, POLICY, 1_700_000_000n).kind).toBe(ReportKind.Record)
})

// The boundary is the expiry itself: the pool's guard is `>=`, so an expiry equal to now is
// already unfundable.
test('expiry exactly now is refused', () => {
	const at = epochOf(CLEAN.dueDate) + BigInt(POLICY.graceSeconds)
	expect(underwrite(CLEAN, POLICY, at).kind).toBe(ReportKind.Reject)
	expect(underwrite(CLEAN, POLICY, at - 1n).kind).toBe(ReportKind.Record)
})
