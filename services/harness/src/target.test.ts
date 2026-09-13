import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTarget } from './target.ts'

const SIGNER = '0xA687F2A567B6d26Dd0E45F08d5ec40f0a25454e7'
const DEBTOR = '0xBB8449f3eAf624AC83c08855aCb1aa77926ff704'

const COMPLETE = {
  claim: {
    debtorTaxId: 'Bayside Club',
    invoiceNumber: 'ORC1043',
    amountMinor: '27500000',
    currency: 'AUD',
    dueDate: '2026-12-31',
    issuerTaxId: SIGNER,
    country: 'AU',
  },
  confirmation: {
    creditor: SIGNER,
    debtor: DEBTOR,
    claimId: `0x${'11'.repeat(32)}`,
    invoiceNumber: 'ORC1043',
    currency: 'AUD',
    amountMinor: '27500000',
    dueDate: '2026-12-31',
    debtorRef: `0x${'22'.repeat(32)}`,
    expiresAtBlock: '99000000',
  },
  signature: `0x${'33'.repeat(65)}`,
  lienId: `0x${'44'.repeat(32)}`,
}

const env = (target: unknown) => ({
  HARNESS_TARGET: JSON.stringify(target),
  HARNESS_SIGNER_ADDRESS: SIGNER,
})

test('a complete target loads', () => {
  const target = loadTarget(env(COMPLETE))
  assert.equal(target.claim.invoiceNumber, 'ORC1043')
  assert.equal(target.confirmation.amountMinor, 27_500_000n)
  assert.equal(target.confirmation.expiresAtBlock, 99_000_000n)
})

/**
 * A half-filled target does not fail once. It fails on every iteration, for ever, as a malformed
 * claim — a red panel that says nothing about the registry and everything about our configuration.
 * The field has to be named, because the operator reading a restart log has nothing else.
 */
test('the target refuses to load without every field the enclave checks', () => {
  for (const field of ['invoiceNumber', 'amountMinor', 'currency', 'dueDate'] as const) {
    const broken = { ...COMPLETE, claim: { ...COMPLETE.claim, [field]: '' } }
    assert.throws(() => loadTarget(env(broken)), new RegExp(field), `${field} was accepted empty`)
  }
  const noConfirmation = { ...COMPLETE, confirmation: { ...COMPLETE.confirmation, debtorRef: '' } }
  assert.throws(() => loadTarget(env(noConfirmation)), /debtorRef/)
})

/**
 * The enclave requires the confirmation's creditor to be the address that submits, and requires
 * the debtor not to be. A confirmation minted for someone else is perfectly valid and produces an
 * unbroken run of `DebtorUnconfirmed` — a harness bouncing for the wrong reason.
 */
test("the target's confirmation names the harness as creditor", () => {
  const other = {
    ...COMPLETE,
    confirmation: { ...COMPLETE.confirmation, creditor: DEBTOR },
  }
  assert.throws(() => loadTarget(env(other)), /creditor/i)
})

test('the target refuses a confirmation the harness itself signed', () => {
  const selfSigned = {
    ...COMPLETE,
    confirmation: { ...COMPLETE.confirmation, debtor: SIGNER },
  }
  assert.throws(() => loadTarget(env(selfSigned)), /debtor/i)
})
