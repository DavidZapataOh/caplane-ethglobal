import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copyLabelFor } from './data-row-label.ts'

test('the copy affordance only appears when a handler is given', () => {
  assert.equal(copyLabelFor('lien id', true), 'Copy the lien id')
  assert.equal(copyLabelFor('lien id', false), undefined)
})
