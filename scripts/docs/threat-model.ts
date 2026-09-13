export type ThreatRow = {
  id: string
  attack: string
  closure: string
  closed: boolean
  kind: 'cryptographic' | 'economic' | 'procedural' | 'structural' | 'open'
  /** `path:line`, so a reader can open the guard rather than take the closure on trust. */
  anchor: string
}

/**
 * Six variants, each with a real anchor for every claim of closure — and one that stays open.
 *
 * The open row is the point of the exercise. Calling it mitigated would cost nothing to write and
 * everything to be caught at: the attack costs less than a tenth of a cent, the two things that
 * would actually close it are not built, and this project's own dossier already says so. A defect
 * nobody rebuts is a defect at full price; a defect dressed as closed is worse.
 */
export const THREATS: readonly ThreatRow[] = [
  {
    id: 'unilateral-operator-registration',
    attack: "The original variant: a single operator wallet registers on a user's behalf.",
    closure:
      'No operator wallet exists. `onReport` reverts unless the sender is the exact forwarder and the workflow name and owner both match.',
    closed: true,
    kind: 'cryptographic',
    anchor: 'contracts/src/CaplaneRegistry.sol:57',
  },
  {
    id: 'preemptive-poisoning',
    attack:
      "Register someone else's receivable first, to block it — denial of service for the price of gas.",
    closure:
      'Measured 2026-09-09: 47,192 gas, $0.00094. Not closeable with the frozen interface — tying a lien to its disbursement would require the registry to know the pool, which is the governance this registry exists to avoid. What would close it, and is not built: an envelope that names its own authorised sender, and a debtor confirmation that binds the creditor rather than only the invoice. What survives regardless: the inbox keeps the submitter in contract state for ever, so an attempt stays provable after logs are pruned.',
    closed: false,
    kind: 'open',
    anchor: 'contracts/src/CaplaneInbox.sol:39',
  },
  {
    id: 'near-collision-squatting',
    attack: 'Register something that matches k of the seven components without being the same right.',
    closure:
      'A threshold calibrated against 903 pairs of real invoices, plus the debtor confirmation: a fabricated right is never confirmed by the party who would owe it.',
    closed: true,
    kind: 'procedural',
    anchor: 'claim/match.ts:39',
  },
  {
    id: 'registrar-equivocation',
    attack: 'Show different lien states to different askers.',
    closure:
      'There is no operator-served view to equivocate with. The state is a public `view`, read straight from a block explorer or the visitor’s own browser.',
    closed: true,
    kind: 'structural',
    anchor: 'contracts/src/CaplaneRegistry.sol:57',
  },
  {
    id: 'enclave-impersonation',
    attack: 'Report as if from the enclave, without one.',
    closure: 'The forwarder relays only reports the DON signed, after verifying attestation.',
    closed: true,
    kind: 'cryptographic',
    anchor: 'contracts/src/CaplaneRegistry.sol:57',
  },
  {
    id: 'malicious-release',
    attack: "Release someone else's lien.",
    closure:
      'A release travels the same forwarder-only path as a record, and carries the repayment condition with it.',
    closed: true,
    kind: 'cryptographic',
    anchor: 'contracts/src/CaplaneRegistry.sol:57',
  },
] as const

export const renderThreatModel = (): string => {
  const header = '| Attack variant | Closure | Kind |\n|---|---|---|'
  const rows = THREATS.map(
    (t) => `| **${t.attack}** | ${t.closed ? '' : '**Open.** '}${t.closure} (\`${t.anchor}\`) | ${t.kind} |`,
  ).join('\n')
  return [
    '# Threat model',
    '',
    'Six attack variants against the registry. No single mechanism closes more than one, which is',
    'the reason for listing them apart rather than as one claim about being secure.',
    '',
    'Five are closed and each names the line that closes it. One is priced and left open, because a',
    'mitigation that does not exist is not a mitigation, and an unrebutted defect costs less to',
    'declare than to be caught hiding.',
    '',
    header,
    rows,
    '',
    '## On the open one',
    '',
    'Anyone can submit a claim over a receivable that is not theirs and have it refused — that is the',
    'registry working. What they can also do is submit one that is **accepted**, over a receivable',
    'someone else was about to finance, and block it. It costs a tenth of a cent.',
    '',
    'Two things would close it and neither is built. The sealed envelope would have to name the',
    'address allowed to submit it in a way a copier cannot reuse. And the confirmation a debtor signs',
    'would have to bind the creditor, not only the invoice — today a debtor can honestly confirm a',
    'real invoice that a stranger is financing.',
    '',
    'What holds regardless is the record: `CaplaneInbox` keeps the submitter of every submission in',
    'contract state, not in a log, so an attempt remains provable long after logs are pruned.',
  ].join('\n')
}
