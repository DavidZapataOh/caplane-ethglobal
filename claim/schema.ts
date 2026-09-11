/**
 * The seven components of a claim, in the order their index takes inside the commitment
 * preimage. The index is hashed and the pepper that salts it never rotates, so this order
 * cannot be rearranged once a lien exists: appending an eighth is safe, inserting one is a
 * reindex nobody can perform.
 *
 * Six are read from the claim document. `issuerTaxId` is not — it comes from the organisation
 * making the submission, which the enclave already knows from the credential it used to read
 * the ledger. That is why it has no value in the seeded corpus.
 */
export const COMPONENT_ORDER = [
  'debtorTaxId',
  'invoiceNumber',
  'amountBucket',
  'dueDate',
  'currency',
  'issuerTaxId',
  'country',
] as const

export type ComponentName = (typeof COMPONENT_ORDER)[number]

/**
 * Properties of the ledger rather than of the claim: every claim from one organisation carries
 * the same three. Two unrelated invoices from one book therefore agree on three components
 * before anything about the debt is compared.
 */
export const LEDGER_CONSTANT = ['currency', 'issuerTaxId', 'country'] as const

/**
 * Raw, as submitted. Every field is a string: this is what arrives over the wire.
 *
 * `debtorTaxId` is the debtor's identity: a tax number when the ledger carries one, the
 * canonical debtor name otherwise — which is the case for eighty-two of this ledger's
 * eighty-three contacts. The field keeps its name deliberately. It enters no preimage, so
 * renaming would change nothing that is hashed, and would break test literals across four
 * plans' worth of artifacts.
 */
export type ClaimInput = {
  debtorTaxId: string
  invoiceNumber: string
  amountMinor: string
  currency: string
  dueDate: string
  issuerTaxId: string
  country: string
}

/** Canonical text, one entry per component, ready to be hashed. */
export type ClaimComponents = Record<ComponentName, string>

export class ClaimError extends Error {
  constructor(
    readonly component: ComponentName,
    readonly reason: string,
  ) {
    super(`${component}: ${reason}`)
  }
}

/**
 * The components the registry indexes. A posting list for a component that every claim shares
 * holds the entire registry, so indexing one bounds nothing and costs the most to walk.
 *
 * Excluded from the index, not from the tuple: the ledger constants still hash with their
 * index and still count toward the returned match count. They are what will separate two
 * ledgers the day there are two.
 */
export const INDEXED_COMPONENTS = [
  'debtorTaxId',
  'invoiceNumber',
  'amountBucket',
  'dueDate',
] as const satisfies readonly ComponentName[]
