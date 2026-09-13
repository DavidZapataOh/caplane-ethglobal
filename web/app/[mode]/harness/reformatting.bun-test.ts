import assert from 'node:assert/strict'
import { test } from 'node:test'
import { THRESHOLD } from '../../../../claim/match.ts'
import { reformattingRows } from './reformatting.ts'

/**
 * The table the panel prints beside the live run, scored by the matcher the enclave itself runs.
 *
 * Computing it here with a second implementation would let the page drift from the registry it
 * describes: the panel would go on claiming a tolerance the chain had stopped having. So the rows
 * come from `agreement` over `toComponents`, the same two functions the workflow imports.
 */
test('the reformatting arm agrees with the enclave own matcher', () => {
  const rows = reformattingRows()

  const reformattings = rows.filter((row) => !row.expectNoMatch)
  assert.equal(reformattings.length, 6, 'the corpus carries six reformattings')
  for (const row of reformattings) {
    assert.ok(
      row.agreed >= THRESHOLD,
      `${row.label} scored ${row.agreed}, below the threshold of ${THRESHOLD}`,
    )
    assert.equal(row.collides, true)
  }
})

/**
 * The corpus carries a seventh entry that is not a reformatting at all: a genuinely different real
 * invoice. Counting it among the six would read as a failure of the matcher; dropping it silently
 * would remove the only case that proves the score can go down.
 */
test('the negative control is kept, labelled, and scores far below the threshold', () => {
  const control = reformattingRows().filter((row) => row.expectNoMatch)
  assert.equal(control.length, 1)
  assert.ok(control[0]!.agreed < THRESHOLD, 'a different receivable must not collide')
  assert.equal(control[0]!.collides, false)
})
