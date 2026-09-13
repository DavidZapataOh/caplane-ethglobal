import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BADGE_VARIANTS } from './badge-variants.ts'
import { renderedPairs } from './contrast.ts'

test('every badge variant clears 4.5:1 in both modes, as the pair it actually renders', () => {
  assert.doesNotThrow(() => renderedPairs(BADGE_VARIANTS, 4.5))
})

test('only "encumbered" wears the seal — the rule the brand is built on', () => {
  for (const [name, v] of Object.entries(BADGE_VARIANTS)) {
    if (name === 'encumbered') {
      assert.equal(v.bg, '--cp-seal')
    } else {
      assert.notEqual(v.bg, '--cp-seal', `${name} must not use the seal fill`)
      assert.notEqual(v.fg, '--cp-seal-text', `${name} must not use the seal as text`)
    }
  }
})

test('four variants, matching the four rows of the semantic-use table', () => {
  assert.deepEqual(Object.keys(BADGE_VARIANTS).sort(), [
    'encumbered',
    'free',
    'released',
    'verified',
  ])
})
