import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCaplaneClient, submitterOf } from 'caplane-sdk'
import { assertOwnSubmission } from './guard.ts'

const client = createCaplaneClient()
const RECORDED = '0xdb0577a4e0025f56d6b8e3f71871a42dccb2bc6447aa366685b42d33505752b3'

// The boundary is a property of the chain, not of this page's good manners: the inbox records who
// sent each submission, and that record is what decides. A console that filtered client-side would
// be one mistake away from showing one organization another's history.
test('a submission that belongs to someone else is refused', async () => {
  await assert.rejects(
    () => assertOwnSubmission(client, RECORDED, '0x0000000000000000000000000000000000000001'),
    /not sent by this wallet/i,
  )
})

test('a submission that belongs to the caller passes', async () => {
  const real = await submitterOf(client, RECORDED)
  await assert.doesNotReject(() => assertOwnSubmission(client, RECORDED, real))
})

// Case is not identity: an address the wallet reports checksummed and one the contract returns
// lowercase are the same account, and refusing on that difference would lock a business out of
// its own history.
test('the comparison ignores case, because an address is not a string', async () => {
  const real = await submitterOf(client, RECORDED)
  await assert.doesNotReject(() =>
    assertOwnSubmission(client, RECORDED, real.toLowerCase() as `0x${string}`),
  )
})
