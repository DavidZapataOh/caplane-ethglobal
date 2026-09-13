import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ClaimType } from '../../../../claim/abi/frozen.ts'
import { claimIdOf } from '../../../../claim/commit.ts'
import { toComponents } from '../../../../claim/index.ts'
import { bindToLedger } from '../../../../caplane-workflow/ledger.ts'
import { confirmationClaimId } from './claim-id.ts'

/**
 * The identity the debtor signs has to be the one the enclave recomputes, and the enclave does not
 * recompute it from what the submitter sent: `bindToLedger` replaces the two fields a submitter
 * could otherwise choose. A page that derived the identity from its own values produced a
 * commitment nothing could ever match, and every submission was refused as unconfirmed — a failure
 * that reads as a debtor who never signed.
 *
 * So this asserts the two derivations against each other rather than against a constant. A fixture
 * would have agreed with whichever side it was copied from.
 */
const INVOICE_FIELDS = {
  invoiceNumber: 'ORC1043',
  amountMinor: '27500000',
  currency: 'AUD',
  dueDate: '2026-12-31',
}

const LEDGER = { tenantId: 'f3d1c0a2-7b44-4e19-9c6e-0a2b8d5e1f37', country: 'AU' }
const CONTACT = { ContactID: 'b8a1f2c3-4d5e-6f70-8192-a3b4c5d6e7f8', Name: 'Bayside Club' }

test('the identity the debtor signs is the one the enclave recomputes', () => {
  const declared = {
    ...INVOICE_FIELDS,
    // What the browser sends for these three is irrelevant: the enclave overwrites all of them.
    debtorTaxId: 'whatever the submitter wrote',
    issuerTaxId: 'whatever the submitter wrote',
    country: 'ZZ',
    claimType: ClaimType.Invoice,
    confirmation: {} as never,
    signature: '0x',
  }

  const bound = bindToLedger(declared, { Contact: CONTACT }, LEDGER.tenantId, LEDGER.country)
  assert.ok(bound !== undefined, 'the enclave could not bind the claim to the ledger')
  const byTheEnclave = claimIdOf(ClaimType.Invoice, toComponents(ClaimType.Invoice, bound))

  assert.equal(confirmationClaimId(INVOICE_FIELDS, CONTACT.Name, LEDGER), byTheEnclave)
})
