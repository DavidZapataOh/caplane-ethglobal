import assert from 'node:assert/strict'
import { test } from 'node:test'
import { keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ClaimType } from '../../../../claim/abi/frozen.ts'
import { CONFIRMATION_TYPES, confirmationDomain } from '../../../../claim/attestation.ts'
import { claimIdOf } from '../../../../claim/commit.ts'
import { toComponents } from '../../../../claim/index.ts'
import { confirmationBinds, recoverConfirmer } from '../../../../caplane-workflow/attestation.ts'
import { bindToLedger } from '../../../../caplane-workflow/ledger.ts'
import { confirmationClaimId } from './claim-id.ts'

/**
 * The whole channel, end to end, against the enclave's own check.
 *
 * Ten conditions have to hold at once for a claim to count as confirmed, and the chain publishes
 * one reason for all ten failing — so a real refusal says which claim was refused and nothing about
 * which condition refused it. Asserting the parts separately left the seam between them untested,
 * and the seam is where the bug lived.
 */
const REGISTRY = '0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b' as const
const CREDITOR = privateKeyToAccount(`0x${'04'.repeat(32)}`)
const DEBTOR = privateKeyToAccount(`0x${'03'.repeat(32)}`)

const LEDGER = { tenantId: 'f3d1c0a2-7b44-4e19-9c6e-0a2b8d5e1f37', country: 'AU' }
const CONTACT = { ContactID: 'b8a1f2c3-4d5e-6f70-8192-a3b4c5d6e7f8', Name: 'Bayside Club' }
const INVOICE_FIELDS = {
  invoiceNumber: 'ORC1043',
  amountMinor: '27500000',
  currency: 'AUD',
  dueDate: '2026-12-31',
}
const BLOCK = 61_879_885n
const EXPIRES = 62_000_000n

/** What the browser seals: the enclave overwrites the two the submitter does not own. */
const declared = {
  ...INVOICE_FIELDS,
  debtorTaxId: DEBTOR.address,
  issuerTaxId: CREDITOR.address,
  country: 'AU',
  claimType: ClaimType.Invoice,
}

const confirmationOver = async (claimId: `0x${string}`) => {
  const confirmation = {
    creditor: CREDITOR.address,
    debtor: DEBTOR.address,
    claimId,
    invoiceNumber: INVOICE_FIELDS.invoiceNumber,
    currency: INVOICE_FIELDS.currency,
    amountMinor: BigInt(INVOICE_FIELDS.amountMinor),
    dueDate: INVOICE_FIELDS.dueDate,
    // Exactly what the confirmation service hashes, and the same bytes the enclave hashes.
    debtorRef: keccak256(toHex(CONTACT.ContactID)),
    expiresAtBlock: EXPIRES,
  }
  const signature = await DEBTOR.signTypedData({
    domain: confirmationDomain(REGISTRY),
    types: CONFIRMATION_TYPES,
    primaryType: 'DebtorConfirmation',
    message: confirmation,
  })
  return { confirmation, signature }
}

const bindsWith = async (claimId: `0x${string}`) => {
  const { confirmation, signature } = await confirmationOver(claimId)
  const bound = bindToLedger(
    { ...declared, confirmation, signature },
    { Contact: CONTACT },
    LEDGER.tenantId,
    LEDGER.country,
  )
  assert.ok(bound !== undefined)
  return confirmationBinds(
    confirmation,
    recoverConfirmer(confirmation, signature, REGISTRY),
    bound,
    { Contact: CONTACT },
    CREDITOR.address,
    BLOCK,
  )
}

test('a confirmation built the way the app builds it satisfies the enclave', async () => {
  const claimId = confirmationClaimId(INVOICE_FIELDS, CONTACT.Name, LEDGER)
  assert.equal(await bindsWith(claimId), true)
})

/**
 * The negative control, and the one that matters: the page used to derive the identity from
 * placeholders, because the fields the enclave substitutes were not available where the form was.
 * It produced a valid signature over a commitment nothing could reach. Without this, a later
 * change that quietly reintroduced a locally-derived identity would go on passing the test above
 * only until it did not.
 */
test('the identity the page used to derive is refused', async () => {
  const asItWas = claimIdOf(
    ClaimType.Invoice,
    toComponents(ClaimType.Invoice, {
      ...INVOICE_FIELDS,
      debtorTaxId: 'unknown',
      issuerTaxId: 'unknown',
      country: 'AU',
    }),
  )
  assert.notEqual(asItWas, confirmationClaimId(INVOICE_FIELDS, CONTACT.Name, LEDGER))
  assert.equal(await bindsWith(asItWas), false)
})
