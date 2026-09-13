import { type Hex, decodeEventLog } from 'viem'
import { registryAbi } from '../../../../contracts/abi/index.ts'
import { REGISTRY, rpc } from './inbox.ts'

/**
 * What the enclave answers, in the order the frozen enum declares. The wire carries a number; a
 * business deciding whether to call its customer should not have to look up what 3 means.
 */
export const REJECT_REASONS = [
  'unset',
  'already encumbered',
  'debtor unconfirmed',
  'compliance hit',
  'source unverified',
  'below threshold',
  'unauthorised submitter',
  'malformed claim',
  'verification unavailable',
  'malformed envelope',
] as const

/** An address as a log topic: left-padded to a full word, which is how the node stores it. */
export const paddedAddress = (address: Hex): Hex =>
  `0x${address.slice(2).toLowerCase().padStart(64, '0')}`

/**
 * `SubmissionRejected(bytes32 indexed submissionId, uint8 reasonCode)` — the submission is the
 * first indexed parameter, so the node filters to this submission alone. Filtering on the event
 * signature instead would return every refusal the registry ever issued, and this page would
 * report somebody else's as its own.
 */
export const rejectionFilter = (registry: Hex, submissionId: Hex) => ({
  address: registry,
  topics: [null, submissionId] as (Hex | null)[],
})

/**
 * `LienRecorded(bytes32 indexed lienId, address indexed borrower, uint64 expiresAt)` — the
 * borrower is the second indexed parameter, so it goes in the third topic slot. The lien this
 * page is waiting for is confirmed afterwards by reading `lienOf(...).submissionId`: a borrower
 * may have several, and only one of them answers to this submission.
 */
export const recordedFilter = (registry: Hex, borrower: Hex) => ({
  address: registry,
  topics: [null, null, paddedAddress(borrower)] as (Hex | null)[],
})

export type Verdict =
  | { kind: 'rejected'; reason: string }
  | { kind: 'recorded'; lienId: Hex }
  | { kind: 'pending' }

type Log = { topics: [Hex, ...Hex[]]; data: Hex }

const decoded = (log: Log) => {
  try {
    return decodeEventLog({ abi: registryAbi, topics: log.topics, data: log.data })
  } catch {
    return undefined
  }
}

/**
 * Waits for the registry to answer, and never assumes an answer it did not see.
 *
 * Two events decide it: a refusal naming this submission, or a lien recorded for this borrower
 * whose stored `submissionId` is this one. If neither appears before the deadline the verdict is
 * `pending` and the page says so — a timer that reported success would be claiming a lien exists
 * because nothing said otherwise.
 */
export const watchVerdict = async (
  submissionId: Hex,
  borrower: Hex,
  deadlineMs = 120_000,
  now = () => Date.now(),
): Promise<Verdict> => {
  const until = now() + deadlineMs
  while (now() < until) {
    const refusals = (await rpc('eth_getLogs', [
      rejectionFilter(REGISTRY, submissionId),
    ])) as unknown as Log[]
    for (const log of refusals) {
      const event = decoded(log)
      if (event?.eventName !== 'SubmissionRejected') continue
      const code = Number((event.args as { reasonCode: number }).reasonCode)
      return { kind: 'rejected', reason: REJECT_REASONS[code] ?? `reason ${code}` }
    }

    const recorded = (await rpc('eth_getLogs', [
      recordedFilter(REGISTRY, borrower),
    ])) as unknown as Log[]
    for (const log of recorded) {
      const event = decoded(log)
      if (event?.eventName !== 'LienRecorded') continue
      const { lienId } = event.args as { lienId: Hex }
      const lien = (await rpc('eth_call', [
        { to: REGISTRY, data: lienCallFor(lienId) },
        'latest',
      ])) as string
      // The struct's last word is the submission it answers to. A borrower can hold several liens;
      // only the one that names this submission is this page's.
      if (lien.endsWith(submissionId.slice(2))) return { kind: 'recorded', lienId }
    }

    await new Promise((resolve) => setTimeout(resolve, 4_000))
  }
  return { kind: 'pending' }
}

/** `lienOf(bytes32)`, written as its selector plus one word — the call has no other shape. */
const lienCallFor = (lienId: Hex): Hex => `0x66999028${lienId.slice(2)}`
