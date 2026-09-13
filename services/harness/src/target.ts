import type { Hex } from './classify.ts'

export type Claim = {
  debtorTaxId: string
  invoiceNumber: string
  amountMinor: string
  currency: string
  dueDate: string
  issuerTaxId: string
  country: string
}

export type Confirmation = {
  creditor: Hex
  debtor: Hex
  claimId: Hex
  invoiceNumber: string
  currency: string
  amountMinor: bigint
  dueDate: string
  debtorRef: Hex
  expiresAtBlock: bigint
}

export type Target = {
  claim: Claim
  confirmation: Confirmation
  signature: Hex
  /** The lien already covering this receivable. Read every iteration; never written. */
  lienId: Hex
}

const CLAIM_FIELDS = [
  'debtorTaxId',
  'invoiceNumber',
  'amountMinor',
  'currency',
  'dueDate',
  'issuerTaxId',
  'country',
] as const

const CONFIRMATION_FIELDS = [
  'creditor',
  'debtor',
  'claimId',
  'invoiceNumber',
  'currency',
  'amountMinor',
  'dueDate',
  'debtorRef',
  'expiresAtBlock',
] as const

const text = (source: Record<string, unknown>, field: string, where: string): string => {
  const value = source[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${where}.${field} is missing`)
  }
  return value
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * The one claim this worker attempts, and the debtor's signature over it.
 *
 * Loaded once and never regenerated. The confirmation is reusable on purpose: nothing in the
 * enclave marks one as spent — the single-use property lives in the confirmation service's own
 * memory, not in the check — so one signature covers every attempt until its expiry block.
 *
 * Everything here is validated before the loop starts. A target missing a field does not fail
 * once; it fails identically for ever, as a malformed claim, and the panel would show a steady
 * refusal that says nothing about the registry.
 */
export const loadTarget = (env: Record<string, string | undefined>): Target => {
  const raw = env.HARNESS_TARGET
  if (raw === undefined || raw.trim() === '') throw new Error('HARNESS_TARGET is not set')
  const signer = env.HARNESS_SIGNER_ADDRESS
  if (signer === undefined || signer.trim() === '') {
    throw new Error('HARNESS_SIGNER_ADDRESS is not set')
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('HARNESS_TARGET is not valid JSON')
  }

  const claimSource = (parsed.claim ?? {}) as Record<string, unknown>
  const claim = Object.fromEntries(
    CLAIM_FIELDS.map((field) => [field, text(claimSource, field, 'claim')]),
  ) as unknown as Claim

  const confirmationSource = (parsed.confirmation ?? {}) as Record<string, unknown>
  for (const field of CONFIRMATION_FIELDS) text(confirmationSource, field, 'confirmation')

  const confirmation: Confirmation = {
    creditor: confirmationSource.creditor as Hex,
    debtor: confirmationSource.debtor as Hex,
    claimId: confirmationSource.claimId as Hex,
    invoiceNumber: confirmationSource.invoiceNumber as string,
    currency: confirmationSource.currency as string,
    amountMinor: BigInt(confirmationSource.amountMinor as string),
    dueDate: confirmationSource.dueDate as string,
    debtorRef: confirmationSource.debtorRef as Hex,
    expiresAtBlock: BigInt(confirmationSource.expiresAtBlock as string),
  }

  // Both of these are checked by the enclave too, and both produce the same refusal code as a
  // debtor who never answered — so catching them here is the only place the difference is visible.
  if (!same(confirmation.creditor, signer)) {
    throw new Error('the confirmation names a different creditor than this harness signs as')
  }
  if (same(confirmation.debtor, signer)) {
    throw new Error('the confirmation was signed by the debtor address this harness submits from')
  }

  return {
    claim,
    confirmation,
    signature: text(parsed as Record<string, unknown>, 'signature', 'target') as Hex,
    lienId: text(parsed as Record<string, unknown>, 'lienId', 'target') as Hex,
  }
}
