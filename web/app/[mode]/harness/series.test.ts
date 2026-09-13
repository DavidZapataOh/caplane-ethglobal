import assert from 'node:assert/strict'
import { test } from 'node:test'
import { REASON_LABEL, joinSeries } from './series.ts'

const id = (n: number) => `0x${String(n).padStart(2, '0').repeat(32)}`

/**
 * The registry does not say who submitted what it refused — `SubmissionRejected` carries the
 * submission id and a reason code and nothing else, deliberately, because naming the submitter
 * would tell a second lender who got there first. The submitter lives in the inbox's own event, in
 * another contract. So the panel is a join, and a panel that read one side alone would either show
 * everyone's refusals or none of them.
 */
test('the series pairs the inbox submission with the registry verdict', () => {
  const rows = joinSeries(
    [
      { submissionId: id(1), blockNumber: 10n },
      { submissionId: id(2), blockNumber: 12n },
    ],
    [{ submissionId: id(1), reason: 1, blockNumber: 11n }],
  )
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { submissionId: id(2), submittedAt: 12n, reason: undefined, decidedAt: undefined })
  assert.deepEqual(rows[1], { submissionId: id(1), submittedAt: 10n, reason: 1, decidedAt: 11n })
})

// Newest first: a judge opening this page reads the top of it, and the interesting attempt is the
// most recent one, not the first one ever made.
test('the series is ordered newest first', () => {
  const rows = joinSeries(
    [
      { submissionId: id(1), blockNumber: 10n },
      { submissionId: id(3), blockNumber: 30n },
      { submissionId: id(2), blockNumber: 20n },
    ],
    [],
  )
  assert.deepEqual(rows.map((r) => r.submittedAt), [30n, 20n, 10n])
})

/**
 * A colour says the attempt was refused; it does not say the registry refused it because the claim
 * was already pledged. Those are different claims about the world and the panel makes only the one
 * it can support.
 */
test('every reason the registry can publish has a name', () => {
  assert.equal(REASON_LABEL[1], 'already pledged')
  for (let reason = 0; reason <= 9; reason += 1) {
    assert.equal(typeof REASON_LABEL[reason], 'string', `reason ${reason} has no name`)
    assert.notEqual(REASON_LABEL[reason], '')
  }
})

test('a submission still waiting is shown as waiting, never as refused', () => {
  const [row] = joinSeries([{ submissionId: id(1), blockNumber: 10n }], [])
  assert.equal(row?.reason, undefined)
})
