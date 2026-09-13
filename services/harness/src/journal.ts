import type { Outcome } from './classify.ts'

export type Journal = {
  bounced: number
  undecidable: number
  unexpected: number
  /** How many times each refusal code that was not a collision came back. */
  reasons: Record<number, number>
  attempts: Array<{ submissionId: string; kind: Outcome['kind']; detail: string }>
}

export const empty = (): Journal => ({
  bounced: 0,
  undecidable: 0,
  unexpected: 0,
  reasons: {},
  attempts: [],
})

const detailOf = (outcome: Outcome): string => {
  if (outcome.kind === 'bounced') return `block ${outcome.block} reason ${outcome.reason}`
  if (outcome.kind === 'undecidable') return outcome.why
  return `reason ${outcome.reason}`
}

export const record = (journal: Journal, outcome: Outcome): Journal => {
  const next: Journal = {
    ...journal,
    reasons: { ...journal.reasons },
    attempts: [...journal.attempts, {
      submissionId: outcome.submissionId,
      kind: outcome.kind,
      detail: detailOf(outcome),
    }],
  }
  if (outcome.kind === 'bounced') next.bounced += 1
  if (outcome.kind === 'undecidable') next.undecidable += 1
  if (outcome.kind === 'unexpected') {
    next.unexpected += 1
    next.reasons[outcome.reason] = (next.reasons[outcome.reason] ?? 0) + 1
  }
  return next
}

/**
 * The series as evidence.
 *
 * Refuses rather than rounds when nothing has been decided: a rate over zero iterations is a
 * number with no measurement behind it, and this file is read by people who will quote it.
 *
 * The residual window travels with the counts on purpose. The reading that fails in the case this
 * method cannot see is the enclave's, not the one taken here, so a node-side outage with a healthy
 * endpoint on this side still lands among the bounces. Stating it beside the figure is the only
 * place a reader would look.
 */
export const render = (journal: Journal): string => {
  const decided = journal.bounced + journal.unexpected
  if (decided === 0) {
    throw new Error('nothing decided yet: refusing to render a rate over zero iterations')
  }
  const lines = [
    'The adversarial run, against the deployed registry.',
    '',
    '--- the series ----------------------------------------------------------------',
    '',
    `    bounced       ${journal.bounced}`,
    `    undecidable   ${journal.undecidable}`,
    `    unexpected    ${journal.unexpected}`,
  ]
  for (const [reason, count] of Object.entries(journal.reasons)) {
    lines.push(`      reason ${reason}   ${count}`)
  }
  lines.push(
    '',
    'Undecidable is counted apart, never folded into the bounces. The registry publishes one',
    'reason code for a lien that is really there and for a registry that could not be read, so a',
    'refusal on its own proves nothing; what counts is the refusal beside a target still',
    'encumbered and a registry that answered for itself.',
    '',
    'What this does not close: the read that fails in the bad case is the enclave’s, and the one',
    'checked here is this process’s own, taken from another client moments later. A node-side',
    'outage with a healthy endpoint on this side would still be counted as a bounce.',
    '',
    '--- every attempt -------------------------------------------------------------',
    '',
  )
  for (const attempt of journal.attempts) {
    lines.push(`    ${attempt.kind.padEnd(12)} ${attempt.submissionId}  ${attempt.detail}`)
  }
  return `${lines.join('\n')}\n`
}
