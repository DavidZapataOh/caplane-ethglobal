import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCaplaneClient, liensOf } from 'caplane-sdk'
import { extractExample } from './quickstart-example.ts'

// Measured against the live chain before writing this test: still returns one recorded lien.
const BORROWER = '0x86Ec9f04485Db066CF155353f15eef356Ae90253'

test('the quickstart example runs and matches the sdk, against the real chain', async () => {
  const run = extractExample('../../content/docs/quickstart.mdx')
  const fromDoc = await run(BORROWER)
  const client = createCaplaneClient()
  const fromSdk = await liensOf(client, BORROWER)
  assert.equal(fromDoc.length, fromSdk.length)
  assert.ok(fromDoc.length > 0, 'expected at least one recorded lien for the example borrower')
  assert.equal(fromDoc[0]?.lienId, fromSdk[0]?.lienId)
})
