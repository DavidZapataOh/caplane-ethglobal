import { type TeeRuntime, cre, json, ok } from '@chainlink/cre-sdk'
import { type Hex, decodeFunctionResult, encodeFunctionData } from 'viem'
import { componentCommitments } from '../claim/commit'
import { toComponents } from '../claim/index'
import { decide } from '../claim/match'
import { registryAbi } from './abi'
import { ClaimType } from './abi/frozen'
import type { Config } from './config'
import { secretBytes } from './secrets'
import type { SubmittedClaim } from './ledger'

const http = new cre.capabilities.HTTPClient()

/** Constants: the runtime exposes `now()`, and the envelope's id is where a timestamp would land. */
const MATCH_ID = 1
const IDENTITY_ID = 2

/**
 * `WORKFLOW_NAME()`. The getter is a public immutable the ABI generator never emitted, so the
 * frozen ABI cannot encode it and the selector is written literally — confirmed against the
 * deployed contract. Editing the ABI to add it would break the byte-identity the vendored copies
 * are checked against.
 */
const IDENTITY_SELECTOR = '0x007271ce'

/**
 * What the registry must answer. The full padded word, not the ten bytes of the name: `bytes10`
 * arrives left-aligned in a word, so comparing against the short value passes on a hand-made
 * fixture and never matches anything real.
 */
const EXPECTED_IDENTITY = '0x3339646565666162396600000000000000000000000000000000000000000000'

export type BatchRead =
	| { kind: 'ok'; lienId: Hex; matched: number }
	| { kind: 'error'; reason: string }

type RpcResponse = { id: number; result?: string; error?: { code: number; message: string } }

export const commitmentsOf = (claimType: number, claim: SubmittedClaim, pepper: Uint8Array): Hex[] =>
	componentCommitments(claimType, toComponents(claimType, claim), pepper)

/**
 * Two calls in one POST. The second reads a value known offline, so a response carrying it cannot
 * have come from a wrong address, an empty registry or a dead endpoint — the three failures that
 * otherwise look exactly like "no collision". A batch is a single request, so the discriminator
 * costs nothing against the call quota.
 */
export const batchBody = (commitments: Hex[], registry: string, blockNumber: bigint): string => {
	// The trigger's own block, never `'latest'`. The trigger is FINALIZED precisely because a lien
	// is permanent, and then reading at the tip put the one state the decision depends on back on
	// a moving target: two deliveries of the same event could observe different registries and
	// emit different reports — and BOTH would land, because the kind is in the nonce preimage, so
	// their nonces differ and neither hits the replay guard. The chain would carry a Record and a
	// Reject for one submission.
	const at = `0x${blockNumber.toString(16)}` as const
	const call = (id: number, data: Hex) => ({
		jsonrpc: '2.0',
		id,
		method: 'eth_call',
		params: [{ to: registry, data }, at],
	})
	return Buffer.from(
		JSON.stringify([
			call(
				MATCH_ID,
				encodeFunctionData({ abi: registryAbi, functionName: 'matchesOf', args: [commitments] }),
			),
			call(IDENTITY_ID, IDENTITY_SELECTOR),
		]),
	).toString('base64')
}

/**
 * Every way this can fail to answer becomes one `error`, because the alternative is a verdict that
 * reads as "no collision". Empty returndata is one of them: a wrong address returns `0x` and viem
 * refuses to decode it rather than yielding zeros.
 *
 * Read by id, not by position: a batch may answer out of order and a per-member error is not fatal
 * to the batch, so a positional read attributes the registry's answer to the wrong call.
 */
export const decodeBatch = (responses: RpcResponse[]): BatchRead => {
	const at = (id: number) => responses.find((r) => r.id === id)
	const match = at(MATCH_ID)
	const identity = at(IDENTITY_ID)

	if (match?.error !== undefined) return { kind: 'error', reason: match.error.message }
	if (identity?.error !== undefined) return { kind: 'error', reason: identity.error.message }
	if (identity?.result !== EXPECTED_IDENTITY) return { kind: 'error', reason: 'identity mismatch' }
	if (match?.result === undefined) return { kind: 'error', reason: 'no match response' }

	try {
		const [lienId, matched] = decodeFunctionResult({
			abi: registryAbi,
			functionName: 'matchesOf',
			data: match.result as Hex,
		})
		return { kind: 'ok', lienId, matched }
	} catch {
		return { kind: 'error', reason: 'undecodable match response' }
	}
}

/**
 * One outbound call, handed the TEE runtime. The chain-read capability is not used and cannot be:
 * all eight of its methods take the ordinary runtime, which a TEE handler never holds. The single
 * accessor that would produce one documents itself as routing the request back out of the enclave,
 * which would hand node operators the commitment being asked about — the exact leak this path
 * exists to prevent. Its name is absent here on purpose: the test that guards this reads text.
 */
export const readRegistry = (
	runtime: TeeRuntime<Config>,
	secrets: Record<string, { value: string }>,
	claim: SubmittedClaim,
	blockNumber: bigint,
): { read: BatchRead; commitments: Hex[] } => {
	const { config } = runtime
	// Hex, not raw text: the two produce different commitments, and the first execution fixes the
	// index format for good — the pepper never rotates and there is no reindex.
	const pepper = secretBytes('COMMITMENT_PEPPER', secrets.COMMITMENT_PEPPER.value)
	const commitments = commitmentsOf(claim.claimType, claim, pepper)

	const response = http
		.sendRequest(runtime, {
			url: config.rpcUrl,
			method: 'POST',
			// Base64, because in the JSON form of the request `body` is bytes. A raw string is
			// reinterpreted as base64 and sends silent garbage whenever its characters happen to
			// fall inside the alphabet.
			body: batchBody(commitments, config.registryAddress, blockNumber),
			multiHeaders: { 'Content-Type': { values: ['application/json'] } },
			// A cached query is a persisted record of which commitment was asked about, which is
			// the leak this whole path exists to prevent. The production limits leave the cache
			// alive with a ten-minute age, so the default is not safe here.
			cacheSettings: { store: false },
		})
		.result()

	if (!ok(response)) {
		return { read: { kind: 'error', reason: `rpc ${response.statusCode}` }, commitments }
	}
	return { read: decodeBatch(json(response) as RpcResponse[]), commitments }
}

export type Verdict =
	| { status: 'collision'; lienId: Hex }
	| { status: 'clear' }
	| { status: 'undecidable'; reason: string }

/**
 * The shared decision knows collision from clear and throws on a response that cannot be both.
 * Everything it cannot see — an rpc error, an undecodable body, the wrong registry — is the third
 * verdict. None of it may read as "clear": the registry not answering and the registry answering
 * no are the difference between refusing a pledge and writing a second one over the first.
 *
 * The gas cap is why this is not hypothetical. The view walks the posting lists inside the call,
 * and the walk is deliberately not truncated — a cap would return a count that is too low and turn
 * a hard failure into a silent double-pledge machine. So past a certain density the node refuses
 * the call, and that refusal has to have somewhere to land.
 */
export const verdictOf = (claimType: number, read: BatchRead): Verdict => {
	if (read.kind === 'error') return { status: 'undecidable', reason: read.reason }
	try {
		const verdict = decide(claimType, { lienId: read.lienId, matched: read.matched })
		return verdict.collision
			? { status: 'collision', lienId: verdict.lienId as Hex }
			: { status: 'clear' }
	} catch (error) {
		return { status: 'undecidable', reason: (error as Error).message }
	}
}
