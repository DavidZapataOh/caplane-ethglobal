import { RejectReason } from 'caplane-sdk'

type Copy = { headline: string; body: string }

/**
 * What a refusal is allowed to say.
 *
 * The rule is the same for all of them: state the fact the chain carries, and nothing the chain
 * does not. `AlreadyEncumbered` is the one that matters — the registry tells a second financier
 * that the claim is taken and refuses to tell them by whom, and copy that guessed out loud would
 * give away with words what the event withholds by design.
 *
 * None of them is phrased as a fault. A refusal is a verdict the enclave reached deliberately, and
 * calling it an error sends a business to support for something that worked exactly as intended.
 */
const COPY: Record<(typeof RejectReason)[keyof typeof RejectReason], Copy> = {
  [RejectReason.Unset]: {
    headline: 'Refused without a stated reason',
    body: 'The registry recorded a refusal and no reason alongside it. Nothing was pledged.',
  },
  [RejectReason.AlreadyEncumbered]: {
    headline: 'This claim is already pledged',
    body: 'A live lien covers it. The registry does not disclose anything further about that lien, and this page cannot show what it was never given.',
  },
  [RejectReason.DebtorUnconfirmed]: {
    headline: 'The counterparty has not confirmed',
    body: 'A confirmation signed by the counterparty must accompany the claim before it can be recorded.',
  },
  [RejectReason.ComplianceHit]: {
    headline: 'Refused on a compliance check',
    body: 'A screening the enclave runs returned a match. The result stays inside the enclave; only the refusal is published.',
  },
  [RejectReason.SourceUnverified]: {
    headline: 'The source could not be verified',
    body: 'The enclave could not confirm the claim against the accounting system it was told to check.',
  },
  [RejectReason.BelowThreshold]: {
    headline: 'Below the threshold to record',
    body: 'The claim did not meet the minimum the risk model requires.',
  },
  [RejectReason.UnauthorizedSubmitter]: {
    headline: 'Submitted by an address the sealer did not authorise',
    body: 'The sealed envelope names the address allowed to submit it, and the transaction came from a different one.',
  },
  [RejectReason.MalformedClaim]: {
    headline: 'The claim could not be read',
    body: 'A field was missing or not in the form the enclave requires. Resealing with the complete claim is the remedy.',
  },
  [RejectReason.VerificationUnavailable]: {
    headline: 'Verification could not be reached',
    body: 'A service the enclave depends on did not answer. Nothing was pledged, and resubmitting later is safe.',
  },
  [RejectReason.MalformedEnvelope]: {
    headline: 'The envelope could not be opened',
    body: 'The enclave could not decrypt what arrived — most often a claim sealed with a stale public key.',
  },
}

export const copyFor = (reason: (typeof RejectReason)[keyof typeof RejectReason]): Copy => {
  const entry = COPY[reason]
  if (entry === undefined) throw new Error(`no copy declared for reject reason ${reason}`)
  return entry
}
