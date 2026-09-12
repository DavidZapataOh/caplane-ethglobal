import type { EVMLog, TeeRuntime } from '@chainlink/cre-sdk'
import { type Hex, bytesToHex, toEventSelector, zeroAddress, zeroHash } from 'viem'
import { CHAIN, ReportKind } from './abi/frozen'
import type { Config } from './config'
import { type ReportBody, nonceFor, submitReport } from './report'

export const SETTLED_TOPIC = toEventSelector('Settled(bytes32,uint256,uint256)')

/**
 * Only `lienId` is indexed; the two amounts stay in the data and this handler needs neither.
 * Typed structurally rather than cast: handing a string to a bytes decoder does not throw, it
 * returns `0xundefinedundefined…`, and a cast is what would hide that.
 */
export const decodeSettled = (log: { topics: readonly Uint8Array[] }): Hex =>
	bytesToHex(log.topics[1] as Uint8Array)

/** Zeros from viem's own constants, not from names this repository would have had to invent. */
export const releaseBody = (lienId: Hex): ReportBody => ({
	kind: ReportKind.Release,
	chainSelector: CHAIN.arcTestnet.chainSelector,
	nonce: nonceFor(lienId, ReportKind.Release),
	lienId,
	submissionId: zeroHash,
	borrower: zeroAddress,
	advanceUsdc6: 0n,
	rateBps: 0,
	expiresAt: 0n,
	componentCommitments: [],
})

/**
 * Runs when an advance settles, and closes the lien so the receivable can be financed again.
 * Without it a paid invoice stays encumbered for ever: the registry is only ever written by a
 * signed report, and nothing else emits one.
 *
 * The escrow emits `Settled` once per lien and never again — the flag it sets is never cleared and
 * a second entry reverts — so this needs no idempotence of its own.
 *
 * It does not check the lien's status before emitting. The registry checks it: `_close` demands an
 * active lien and reverts otherwise. Checking here would cost a chain read, which is the second
 * crossing this package exists to avoid.
 *
 * It reads nothing, fetches nothing and holds no secret. The whole decision is the event.
 */
export const onAdvanceSettled = (runtime: TeeRuntime<Config>, log: EVMLog): string => {
	const lienId = decodeSettled(log)
	submitReport(runtime, releaseBody(lienId))
	return `${lienId} released`
}
