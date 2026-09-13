import assert from 'node:assert/strict'
import { test } from 'node:test'
import { x25519 } from '@noble/curves/ed25519.js'
import { keccak256, toHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CONFIRMATION_TYPES, confirmationDomain } from '../../../../claim/attestation.ts'
import { ClaimType } from '../../../../claim/abi/frozen.ts'
import { toComponents } from '../../../../claim/index.ts'
import { claimIdOf } from '../../../../claim/commit.ts'
import { open } from '../../../../caplane-workflow/envelope.ts'
import { decodeClaim } from '../../../../caplane-workflow/ledger.ts'
import { buildEnvelope } from './seal.ts'

const REGISTRY = '0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b' as const
const SUBMITTER = privateKeyToAccount(`0x${'04'.repeat(32)}`)
const DEBTOR = privateKeyToAccount(`0x${'03'.repeat(32)}`)

const CLAIM = {
  debtorTaxId: 'Bayside Club',
  invoiceNumber: 'ORC1043',
  amountMinor: '27500000',
  currency: 'AUD',
  dueDate: '2027-01-30',
  issuerTaxId: 'e1218a28',
  country: 'AU',
}

const enclaveSecret = x25519.utils.randomSecretKey()
const enclavePublicKey = toHex(x25519.getPublicKey(enclaveSecret))

const confirmationFor = async (debtorTaxId = CLAIM.debtorTaxId) => {
  const claim = { ...CLAIM, debtorTaxId }
  const confirmation = {
    creditor: SUBMITTER.address,
    debtor: DEBTOR.address,
    claimId: claimIdOf(ClaimType.Invoice, toComponents(ClaimType.Invoice, claim)),
    invoiceNumber: claim.invoiceNumber,
    currency: claim.currency,
    amountMinor: 27_500_000n,
    dueDate: claim.dueDate,
    debtorRef: keccak256(toHex('contact-id')),
    expiresAtBlock: 70_000_000n,
  }
  const signature = await DEBTOR.signTypedData({
    domain: confirmationDomain(REGISTRY),
    types: CONFIRMATION_TYPES,
    primaryType: 'DebtorConfirmation',
    message: confirmation,
  })
  return { claim, confirmation, signature }
}

// The test this task exists for: what the browser seals has to open with the enclave's own decoder,
// not with a copy of it written to agree. Two implementations of one contract drift in silence.
test('the sealed claim opens with the real workflow decoder', async () => {
  const { claim, confirmation, signature } = await confirmationFor()
  const envelope = buildEnvelope(claim, confirmation, signature, SUBMITTER.address, enclavePublicKey)
  const opened = open(envelope, enclaveSecret)
  const declared = decodeClaim(opened.claim)
  assert.equal(declared.invoiceNumber, CLAIM.invoiceNumber)
  assert.equal(declared.signature, signature)
  assert.equal(declared.confirmation.claimId, confirmation.claimId)
})

// The address inside the envelope is the one that will call `submit`, and the enclave compares the
// two. Sealing for one wallet and submitting from another is the relay this check exists to catch.
test('the envelope carries the address that will submit it', async () => {
  const { claim, confirmation, signature } = await confirmationFor()
  const envelope = buildEnvelope(claim, confirmation, signature, SUBMITTER.address, enclavePublicKey)
  const opened = open(envelope, enclaveSecret)
  assert.equal(toHex(opened.authorizedSubmitter).toLowerCase(), SUBMITTER.address.toLowerCase())
})

// The claim id inside the confirmation is the pepper-free identity, not the registry key: the
// peppered derivation is not constructible at this call site, on purpose.
test('the claim id is derived without a pepper argument', () => {
  const id = claimIdOf(ClaimType.Invoice, toComponents(ClaimType.Invoice, CLAIM))
  assert.equal(id.length, 66)
})

// A real debtor's name is longer than the seven characters the envelope budget was first measured
// with, so this page measures its own rather than inheriting that number.
test('a realistic envelope still fits the inbox budget', async () => {
  const { claim, confirmation, signature } = await confirmationFor(
    'A Rather Long Corporate Entity Pty Ltd',
  )
  const envelope = buildEnvelope(claim, confirmation, signature, SUBMITTER.address, enclavePublicKey)
  assert.ok(envelope.length < 4096, `envelope is ${envelope.length} bytes`)
})
