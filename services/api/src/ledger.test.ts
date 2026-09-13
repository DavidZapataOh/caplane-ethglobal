import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CONTACTS_SCOPE, contactEmailOf, searchContacts, tokenFor } from './ledger.js'

const CONTACT = '3e776c4b-ea9e-4bb1-96be-6b0c7a71a37f'

// The whole reason a ledger credential is allowed on a platform surface at all. Measured against
// the provider: a contacts-scoped token answers 401 to the invoice route. If this ever passes for
// the wrong reason — because the credential is absent — the test below it catches that instead.
test('the credential cannot read an invoice', async () => {
  const { token, tenant } = await tokenFor()
  const response = await fetch(
    'https://api.xero.com/api.xro/2.0/Invoices?where=InvoiceNumber%3D%3D%22ORC1043%22',
    { headers: { authorization: `Bearer ${token}`, 'xero-tenant-id': tenant, accept: 'application/json' } },
  )
  assert.equal(response.status, 401)
})

test('the scope asked for is contacts and nothing else', () => {
  assert.equal(CONTACTS_SCOPE, 'accounting.contacts.read')
  const source = readFileSync(new URL('../../src/ledger.ts', import.meta.url), 'utf8')
  assert.equal(/accounting\.(invoices|transactions)\.read/.test(source), false)
})

// The invoice response carries the contact's id and name and nothing else, so this second call is
// what the whole channel rests on. Measured: EmailAddress comes back non-empty for this contact.
test('the contact resolves to an address', async () => {
  const email = await contactEmailOf(CONTACT)
  assert.ok(email !== undefined && email.includes('@'), 'the ledger returned no address')
})

// An unknown contact is an absence, not a failure: the caller has to tell "this debtor has no
// address on file" from "the ledger is down", because the first is a refusal to send and the
// second is a retry.
test('an unknown contact is undefined, not a throw', async () => {
  assert.equal(await contactEmailOf('00000000-0000-0000-0000-000000000000'), undefined)
})

// A missing credential must be loud. Silently falling back to the invoice-reading pair is the one
// mistake that would undo the property this module exists to hold.
test('a missing credential throws by name and never falls back', async () => {
  const id = process.env.LEDGER_CONTACTS_ID
  delete process.env.LEDGER_CONTACTS_ID
  try {
    await assert.rejects(() => tokenFor(), /LEDGER_CONTACTS_ID/)
  } finally {
    if (id !== undefined) process.env.LEDGER_CONTACTS_ID = id
  }
  const source = readFileSync(new URL('../../src/ledger.ts', import.meta.url), 'utf8')
  assert.equal(/LEDGER_APP_(ID|PASSPHRASE)/.test(source), false, 'the module names the wide credential')
})

// The whole reason a search is safe on this credential: it is the same scope already proven
// against the single-contact route, never the invoice one.
test('a search returns id and name, nothing an invoice route would need', async () => {
  const found = await searchContacts('Bayside')
  assert.ok(found.length >= 1, 'the ledger matched nothing for a name it holds')
  assert.ok(found.every((c: { id: unknown; name: unknown }) => typeof c.id === 'string' && typeof c.name === 'string'))
  assert.ok(found.some((c: { name: string }) => c.name.includes('Bayside')))
})

// A query with no match is an empty list, not a failure: the business is exploring, not confirming
// an id it already knows.
test('an unmatched query is empty, not an error', async () => {
  assert.deepEqual(await searchContacts('zzznoonezzz'), [])
})

// One or two characters against a real ledger return too much to be useful and spend a wide scan
// on someone else's API for no benefit to the caller.
test('a query under three characters is refused before it reaches the ledger', async () => {
  await assert.rejects(() => searchContacts('ab'), /at least three characters/)
})
