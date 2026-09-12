import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONFIRMATION_TYPES, confirmationDomain } from './confirmation.js'

const canonical = readFileSync(new URL('../../../../claim/attestation.ts', import.meta.url), 'utf8')

// The structure is restated here rather than imported: the package that owns it ships raw
// TypeScript with its own runtime dependencies and no build, so there is nothing this service can
// consume. What restating costs is drift — and drift here is the worst kind, because this service
// would accept a signature the enclave then refuses, turning a channel fault into a paid-for
// refusal on chain that reads as the debtor saying no. So the copy is pinned to the original.
test('the signed structure is exactly the one the enclave verifies', () => {
  const block = canonical.slice(
    canonical.indexOf('export const CONFIRMATION_TYPES'),
    canonical.indexOf('] as const', canonical.indexOf('export const CONFIRMATION_TYPES')),
  )
  const fields = [...block.matchAll(/\{ name: '(\w+)', type: '(\w+)' \}/g)].map((found) => ({
    name: found[1],
    type: found[2],
  }))
  assert.equal(fields.length, 9, 'the canonical definition was not parsed')
  assert.deepEqual(CONFIRMATION_TYPES.DebtorConfirmation, fields)
})

// The domain is separation, not a verifier: nothing on chain checks this signature. What it stops
// is a confirmation signed against one deployment meaning anything against another.
test('the domain matches the one the enclave builds', () => {
  assert.match(canonical, /name: 'Caplane'/)
  assert.match(canonical, /version: '1'/)
  const domain = confirmationDomain('0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b')
  assert.equal(domain.name, 'Caplane')
  assert.equal(domain.version, '1')
  assert.equal(domain.chainId, 5042002)
  assert.equal(domain.verifyingContract, '0xe7170ee0ce4cab4593970ef5c4ebf7d0d62ae19b')
})

// Nine field names, in order. The order is the type hash: one swap and every existing signature
// stops recovering, silently, because a wrong hash recovers a well-formed and different address.
test('the field order is the one the type hash is built from', () => {
  assert.deepEqual(
    CONFIRMATION_TYPES.DebtorConfirmation.map((field) => field.name),
    [
      'creditor',
      'debtor',
      'claimId',
      'invoiceNumber',
      'currency',
      'amountMinor',
      'dueDate',
      'debtorRef',
      'expiresAtBlock',
    ],
  )
})
