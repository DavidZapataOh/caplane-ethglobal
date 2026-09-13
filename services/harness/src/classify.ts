export type Hex = `0x${string}`

/** What the registry reports for a lien it holds. Active is the only state that explains a refusal. */
const ACTIVE = 1

export type Verdict =
  | { kind: 'rejected'; reason: number; block: bigint }
  | { kind: 'recorded' }
  | { kind: 'pending' }

export type Outcome =
  | { kind: 'bounced'; submissionId: Hex; block: bigint; reason: 1 }
  | { kind: 'undecidable'; submissionId: Hex; why: string }
  | { kind: 'unexpected'; submissionId: Hex; reason: number }

/**
 * Whether one attempt proved anything.
 *
 * `AlreadyEncumbered` is published for two different facts. A registry that holds a live lien and
 * refuses the second claim is the property this harness exists to show. A registry that could not
 * be read refuses too — the workflow sends an undecidable read into the same arm deliberately,
 * because neither of them approves — and it shows nothing at all. From the chain the two are one
 * event.
 *
 * So a refusal alone is never a bounce here. It counts only beside two readings taken separately:
 * the target still encumbered, and the registry answering. Neither is inferred from the refusal.
 *
 * What this cannot separate: the read that fails in the bad case is the enclave's, and the one
 * checked here is the harness's own, from another client moments later. A node-side outage with a
 * healthy harness-side endpoint still lands as `bounced`. The window is narrowed, not closed, and
 * the evidence says so rather than claiming a guarantee.
 */
export const classify = (input: {
  submissionId: Hex
  verdict: Verdict
  lienStatus: number | undefined
  registryAnswers: boolean
}): Outcome => {
  const { submissionId, verdict, lienStatus, registryAnswers } = input

  if (verdict.kind === 'pending') {
    return { kind: 'undecidable', submissionId, why: 'no verdict arrived within the window' }
  }
  if (verdict.kind === 'recorded') {
    // Reason zero is not a refusal code. It is this harness saying it did the one thing it must
    // never do, in the only field the caller already reads.
    return { kind: 'unexpected', submissionId, reason: 0 }
  }
  if (verdict.reason !== 1) {
    return { kind: 'unexpected', submissionId, reason: verdict.reason }
  }
  if (!registryAnswers) {
    return { kind: 'undecidable', submissionId, why: 'the registry did not answer for itself' }
  }
  if (lienStatus !== ACTIVE) {
    return {
      kind: 'undecidable',
      submissionId,
      why: `the target is not encumbered (status ${String(lienStatus)})`,
    }
  }
  return { kind: 'bounced', submissionId, block: verdict.block, reason: 1 }
}
