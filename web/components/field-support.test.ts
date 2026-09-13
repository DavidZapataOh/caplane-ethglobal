import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderedPairs } from './contrast.ts'
import { FIELD_HINT_PAIR, describedById } from './field-support.ts'

test('the hint and error text clears 4.5:1 in both modes', () => {
  assert.doesNotThrow(() => renderedPairs({ hint: FIELD_HINT_PAIR }, 4.5))
})

test('a field message is never the seal — a bad value is not a lien', () => {
  assert.notEqual(FIELD_HINT_PAIR.fg, '--cp-seal-text')
  assert.notEqual(FIELD_HINT_PAIR.fg, '--cp-seal')
})

test('two fields on one page never collide on the same describedby id', () => {
  assert.notEqual(describedById('a'), describedById('b'))
})

test('a field with no message has no describedby id to point at', () => {
  assert.equal(describedById('a', false), undefined)
})
