import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCaplaneClient } from './client.js'
import { outcomeOf, submissionsOf, submitterOf } from './inbox.js'

const client = createCaplaneClient()

// Two submissions already on Arc Testnet, whose outcomes are permanent history and cannot change:
// one the enclave refused for colliding with a lien that already existed, one it recorded.
const REJECTED = '0x9c22eff8f4efee07013d86feaf5f1a559053004f1f61915873690d57e5a08b29'
const RECORDED = '0xdb0577a4e0025f56d6b8e3f71871a42dccb2bc6447aa366685b42d33505752b3'

// Both fixtures landed a few thousand blocks after deployment, recorded in the workflow's own
// evidence: 61,685,965 and 61,686,810. A verdict cannot precede its submission, so scanning from
// just under them is not a shortcut — it is the range the answer can possibly be in, and it is the
// range a console would pass, since `submissionsOf` hands it the block of every submission.
const NEAR = 61_685_000n

// The point of the whole module: a submitter reads what became of its own envelope from chain
// state alone, with no service of ours in the path.
test('a rejected submission resolves to its reason, and nothing else', async () => {
  const submitter = await submitterOf(client, REJECTED)
  const outcome = await outcomeOf(client, REJECTED, submitter, { fromBlock: NEAR })
  assert.equal(outcome.status, 'rejected')
  if (outcome.status === 'rejected') {
    assert.equal(outcome.reason, 1)
    // The refusal names no lien, because the event carries none. What a second financier cannot
    // learn here is not hidden by this code — it never arrives.
    assert.ok(!('lien' in outcome))
  }
})

test('a recorded submission resolves to the lien it produced', async () => {
  const submitter = await submitterOf(client, RECORDED)
  const outcome = await outcomeOf(client, RECORDED, submitter, { fromBlock: NEAR })
  assert.ok(
    outcome.status !== 'pending' && outcome.status !== 'rejected',
    `expected a lien, got ${outcome.status}`,
  )
  // The lien found has to be the one this submission produced, not merely one the same borrower
  // happens to hold: `LienRecorded` never indexes the submission, so the link is the stored field.
  assert.equal((outcome as { lien: { submissionId: string } }).lien.submissionId, RECORDED)
})

// "Never happened" and "not answered yet" are the same observation from outside, and reporting
// either as a failure would tell a business its claim was refused when the workflow is simply
// still running.
test('an unknown submission id is pending, not an error', async () => {
  const unknown = `0x${'ab'.repeat(32)}` as const
  // One page is enough to prove the default: what is being tested is that an absent verdict reads
  // as `pending` rather than as a failure, not how far the sweep reaches — `submissionsOf` covers
  // the range, and repeating a full sweep here only spends the public endpoint's budget.
  const outcome = await outcomeOf(client, unknown, '0x0000000000000000000000000000000000000001', {
    fromBlock: 61_800_000n,
  })
  assert.equal(outcome.status, 'pending')
})

test("submissionsOf finds the fixture among a real submitter's history", async () => {
  const submitter = await submitterOf(client, RECORDED)
  const mine = await submissionsOf(client, submitter, { fromBlock: NEAR })
  assert.ok(mine.some((submission: { submissionId: string }) => submission.submissionId === RECORDED))
})
